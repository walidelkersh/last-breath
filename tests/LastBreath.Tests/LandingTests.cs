using LastBreath.Core;

namespace LastBreath.Tests;

[Trait("Category", "Common")]
public sealed class LandingTests
{
    private const int Million = 1_000_000;
    private const int Hundred = 100;
    private const int Weights = 100_000;

    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private static Board BoardWithOneEmptyCell(int emptyIndex)
    {
        var board = new Board();
        for (var index = 0; index < Board.Size; index++)
            if (index != emptyIndex) board[index] = new Cell(CellKind.Cash, 50);
        return board;
    }

    private static List<Landed> DrawLastCell(string dive, params int[] rolls) =>
        Landing.Draw(Default, Default.Dives[dive], BoardWithOneEmptyCell(14), 0, new ScriptedRandom(rolls));

    private static int[] Repeat(int roll, int times) => Enumerable.Repeat(roll, times).ToArray();

    [Fact]
    public void ClassicCrateLandsBelowTheThresholdAndNothingLandsAtIt()
    {
        var below = DrawLastCell("Classic", 34_059, 0);
        var at = DrawLastCell("Classic", 34_060);

        Assert.Equal(new Landed(14, Outcome.Crate, new Cell(CellKind.Cash, 50)), Assert.Single(below));
        Assert.Empty(at);
    }

    // Mixed table thresholds are the running sums 32000, 58000, 75000, 85000, 93000, 97000, 98500, 99500, 99900, 99980, 100000.
    [Theory]
    [InlineData(0, CellKind.Cash, 50)]
    [InlineData(31_999, CellKind.Cash, 50)]
    [InlineData(32_000, CellKind.Cash, 100)]
    [InlineData(58_000, CellKind.Cash, 200)]
    [InlineData(75_000, CellKind.Cash, 250)]
    [InlineData(85_000, CellKind.Cash, 500)]
    [InlineData(93_000, CellKind.Cash, 1_000)]
    [InlineData(97_000, CellKind.Cash, 2_000)]
    [InlineData(98_500, CellKind.Cash, 3_000)]
    [InlineData(99_499, CellKind.Cash, 3_000)]
    [InlineData(99_500, CellKind.Jackpot, 5_000)]
    [InlineData(99_900, CellKind.Jackpot, 20_000)]
    [InlineData(99_980, CellKind.Jackpot, 100_000)]
    [InlineData(99_999, CellKind.Jackpot, 100_000)]
    public void ClassicTierFollowsTheMixedTableThresholds(int tierRoll, CellKind kind, int units)
    {
        var landed = Assert.Single(DrawLastCell("Classic", 0, tierRoll));

        Assert.Equal(new Cell(kind, units), landed.Cell);
    }

    // Shallow thresholds end 99855, 99975, 100000 and its Major weight is 0, so no roll reaches 100,000 units.
    [Theory]
    [InlineData(99_974, 5_000)]
    [InlineData(99_975, 20_000)]
    [InlineData(99_999, 20_000)]
    public void DriftNeverLandsAMajor(int tierRoll, int units)
    {
        var landed = Assert.Single(DrawLastCell("Static", 0, tierRoll));

        Assert.Equal(new Cell(CellKind.Jackpot, units), landed.Cell);
    }

    [Fact]
    public void OccupiedCellsDrawNothing()
    {
        var random = new ScriptedRandom(0, 0);

        var landed = Landing.Draw(Default, Default.Dives["Classic"], BoardWithOneEmptyCell(14), 0, random);

        Assert.Single(landed);
        Assert.Equal([Million, Weights], random.Bounds);
    }

    [Fact]
    public void EmptyCellsDrawInIndexOrderWithTheTierRightAfterItsOutcome()
    {
        int[] rolls =
        [
            .. Repeat(999_999, 2),      // cells 0 and 1 stay empty
            0, 0,                       // cell 2: crate, tier 0
            .. Repeat(999_999, 6),      // cells 3 to 8
            0, 99_999,                  // cell 9: crate, tier 10
            .. Repeat(999_999, 5),      // cells 10 to 14
        ];
        var random = new ScriptedRandom(rolls);

        var landed = Landing.Draw(Default, Default.Dives["Classic"], new Board(), 0, random);

        Assert.Equal(
            [
                new Landed(2, Outcome.Crate, new Cell(CellKind.Cash, 50)),
                new Landed(9, Outcome.Crate, new Cell(CellKind.Jackpot, 100_000)),
            ],
            landed);
        Assert.Equal(
            [.. Repeat(Million, 2), Million, Weights, .. Repeat(Million, 6), Million, Weights, .. Repeat(Million, 5)],
            random.Bounds);
        Assert.Equal(0, random.Remaining);
    }

    [Fact]
    public void DrawLeavesTheBoardAsItFoundIt()
    {
        var board = new Board();
        board[0] = new Cell(CellKind.Cash, 3_000);

        var landed = Landing.Draw(Default, Default.Dives["Classic"], board, 0, new ScriptedRandom([.. Repeat(999_999, 14)]));

        Assert.Empty(landed);
        Assert.Equal(1, board.Occupied);
        Assert.Equal(new Cell(CellKind.Cash, 3_000), board[0]);
    }

    // Tank thresholds are 93120 (crate), 101120 (+1), 104120 (+2), 105120 (+3).
    [Theory]
    [InlineData(93_119, Outcome.Crate)]
    [InlineData(93_120, Outcome.TankPlus1)]
    [InlineData(101_119, Outcome.TankPlus1)]
    [InlineData(101_120, Outcome.TankPlus2)]
    [InlineData(104_119, Outcome.TankPlus2)]
    [InlineData(104_120, Outcome.TankPlus3)]
    [InlineData(105_119, Outcome.TankPlus3)]
    public void TankOutcomesFollowTheLandingThresholds(int roll, Outcome expected)
    {
        int[] rolls = expected == Outcome.Crate ? [roll, 0] : [roll];

        var landed = Assert.Single(DrawLastCell("Tank", rolls));

        Assert.Equal(expected, landed.Outcome);
    }

    [Fact]
    public void AboveTheLastThresholdTheCellStaysEmpty()
    {
        Assert.Empty(DrawLastCell("Tank", 105_120));
    }

    [Fact]
    public void ATankTakesNoRollForATier()
    {
        var random = new ScriptedRandom(101_120);

        var landed = Landing.Draw(Default, Default.Dives["Tank"], BoardWithOneEmptyCell(14), 0, random);

        Assert.Equal(new Landed(14, Outcome.TankPlus2, default), Assert.Single(landed));
        Assert.Equal([Million], random.Bounds);
    }

    [Fact]
    public void TanksInOneSpinCountTowardTheLimitInCellOrder()
    {
        int[] rolls =
        [
            93_120, 104_120, 101_120, 93_120,   // +1, +3, +2 land and the fourth tank is one too many
            .. Repeat(999_999, 11),
        ];
        var random = new ScriptedRandom(rolls);

        var landed = Landing.Draw(Default, Default.Dives["Tank"], new Board(), 0, random);

        Assert.Equal([Outcome.TankPlus1, Outcome.TankPlus3, Outcome.TankPlus2], landed.Select(l => l.Outcome));
        Assert.Equal([0, 1, 2], landed.Select(l => l.Index));
        Assert.Equal(Repeat(Million, 15), random.Bounds);
    }

    [Fact]
    public void TankPastTheLimitBecomesEmptyWithoutAnotherRoll()
    {
        var random = new ScriptedRandom([104_120, .. Repeat(999_999, 14)]);

        var landed = Landing.Draw(Default, Default.Dives["Tank"], new Board(), 3, random);

        Assert.Empty(landed);
        Assert.Equal(Repeat(Million, 15), random.Bounds);
    }

    [Fact]
    public void TankNeverLandsInADiveWithoutATankLimit()
    {
        var noLimit = Default.Dives["Tank"] with { TankLimit = null };

        var landed = Landing.Draw(Default, noLimit, BoardWithOneEmptyCell(14), 0, new ScriptedRandom(93_120));

        Assert.Empty(landed);
    }

    // Crew-style table: crate below 18647, Bosun below 26647, Captain below 38647.
    private static DiveConfig CrewStyle => Default.Dives["Classic"] with
    {
        Landing =
        [
            new LandingEntry { Outcome = Outcome.Crate, Numerator = 18_647 },
            new LandingEntry { Outcome = Outcome.Bosun, Numerator = 8_000 },
            new LandingEntry { Outcome = Outcome.Captain, Numerator = 12_000 },
        ],
    };

    [Theory]
    [InlineData(0, 50)]
    [InlineData(59, 50)]
    [InlineData(60, 100)]
    [InlineData(89, 100)]
    [InlineData(90, 250)]
    [InlineData(99, 250)]
    public void BosunFaceFollowsTheSixtyThirtyTenSplit(int faceRoll, int units)
    {
        var random = new ScriptedRandom(18_647, faceRoll);

        var landed = Landing.Draw(Default, CrewStyle, BoardWithOneEmptyCell(14), 0, random);

        Assert.Equal(new Landed(14, Outcome.Bosun, new Cell(CellKind.Cash, units)), Assert.Single(landed));
        Assert.Equal([Million, Hundred], random.Bounds);
    }

    [Fact]
    public void CaptainLandsWithNoValueYetAndTakesNoFurtherRoll()
    {
        var random = new ScriptedRandom(26_647);

        var landed = Landing.Draw(Default, CrewStyle, BoardWithOneEmptyCell(14), 0, random);

        Assert.Equal(new Landed(14, Outcome.Captain, new Cell(CellKind.Captain, 0)), Assert.Single(landed));
        Assert.Equal([Million], random.Bounds);
    }

    // 15 cells each landing a crate with probability 34060 / 1,000,000. Over 100,000 spins the mean is
    // 51,090 crates with a standard deviation of about 222, so the band is five deviations wide.
    [Fact]
    public void RealRandomSourceLandsClassicCratesAtTheConfiguredRate()
    {
        var random = new Pcg32Random(2026);
        var crates = 0;

        for (var spin = 0; spin < 100_000; spin++)
            crates += Landing.Draw(Default, Default.Dives["Classic"], new Board(), 0, random).Count;

        Assert.InRange(crates, 51_090 - 1_110, 51_090 + 1_110);
    }
}
