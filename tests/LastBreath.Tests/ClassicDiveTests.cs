using LastBreath.Core;
using LastBreath.Core.Dives;

namespace LastBreath.Tests;

// Mixed table tier rolls used below: 0 is 50 units, 32,000 is 100, 58,000 is 200, 75,000 is 250,
// 85,000 is 500, 98,500 is 3,000, 99,500 is the Mini (5,000 units).
[Trait("Category", "Classic")]
public sealed class ClassicDiveTests
{
    private const int Million = 1_000_000;

    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private static Round Play(IRandomSource random) => ClassicDive.Play(Default, Default.Dives["Classic"], random);

    [Fact]
    public void ThreeDeadSpinsInARowEndTheRoundAtZero()
    {
        var random = new ScriptedRandom(Rolls.Miss(45));

        var round = Play(random);

        Assert.Equal("0/2 0/1 0/0", RoundText.Turns(round));
        Assert.True(round.IsOver);
        Assert.Equal(0, round.Award);
        Assert.Equal(0, random.Remaining);
    }

    [Fact]
    public void EveryRoundStartsFromAnEmptyBoardSoTheFirstSpinDrawsAllFifteenCells()
    {
        var random = new ScriptedRandom(Rolls.Miss(45));

        Play(random);

        Assert.Equal(Enumerable.Repeat(Million, 45), random.Bounds);
    }

    [Fact]
    public void ALandingOnTheSecondBreathRefillsToThreeNotMore()
    {
        int[] rolls =
        [
            .. Rolls.Miss(15),                                // spin 1, breaths 3 to 2
            .. Rolls.Miss(3), .. Rolls.Crate(), .. Rolls.Miss(11),  // spin 2, cell 3 lands, breaths back to 3
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14), // spins 3 to 5, breaths 2, 1, 0
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("0/2 50/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal("3:50", RoundText.Cells(round));
    }

    [Fact]
    public void AJackpotCountsAsALandingAndRefillsOnTheLastBreath()
    {
        int[] rolls =
        [
            .. Rolls.Miss(15), .. Rolls.Miss(15),                    // spins 1 and 2, breaths down to 1
            .. Rolls.Crate(99_500), .. Rolls.Miss(14),               // spin 3, a Mini lands in cell 0
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14), // spins 4 to 6
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("0/2 0/1 5000/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal(new Cell(CellKind.Jackpot, 5_000), round.Board[0]);
        Assert.Equal(5_000, round.Award);
    }

    [Fact]
    public void SeveralCratesInOneSpinAllCountWithNoCap()
    {
        int[] rolls =
        [
            .. Rolls.Crate(0), .. Rolls.Crate(32_000), .. Rolls.Crate(58_000),
            .. Rolls.Crate(75_000), .. Rolls.Crate(85_000), .. Rolls.Miss(10), // spin 1, five crates
            .. Rolls.Miss(10), .. Rolls.Miss(10), .. Rolls.Miss(10),           // spins 2 to 4
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("1100/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal("0:50 1:100 2:200 3:250 4:500", RoundText.Cells(round));
        Assert.Equal(1_100, round.Award);
    }

    [Fact]
    public void AFullBoardEndsTheRoundAtOnceAndForfeitsTheBreathsLeft()
    {
        var random = new ScriptedRandom(Rolls.Crates(15));

        var round = Play(random);

        Assert.Single(round.Turns);
        Assert.Equal(3, round.Clock);
        Assert.True(round.IsOver);
        Assert.Equal(750, round.CoinWin);
        Assert.Equal(1_000_000, round.GrandWin);
        Assert.Equal(1_000_750, round.Award);
        Assert.Equal(0, random.Remaining);
    }

    [Fact]
    public void FillingTheLastCellOnTheLastBreathStillPaysTheGrand()
    {
        int[] rolls =
        [
            .. Rolls.Crates(14), .. Rolls.Miss(1),  // spin 1, cells 0 to 13 land, breaths stay 3
            .. Rolls.Miss(1), .. Rolls.Miss(1),     // spins 2 and 3, breaths down to 1
            .. Rolls.Crate(98_500),                 // spin 4, the last cell lands 3,000 units
        ];
        var random = new ScriptedRandom(rolls);

        var round = Play(random);

        Assert.Equal("700/3 0/2 0/1 3000/3", RoundText.Turns(round));
        Assert.Equal(1_003_700, round.Award);
        Assert.Equal(0, random.Remaining);
    }

    [Fact]
    public void ADiveWithoutARefillValueIsRejected()
    {
        var noRefill = Default.Dives["Classic"] with { RefillTo = null };

        Assert.Throws<ArgumentException>(() => ClassicDive.Play(Default, noRefill, new ScriptedRandom()));
    }

    // Expected rounds come from a separate Python model of the draw order, not from this engine.
    // Each turn reads "win/breaths left" and each cell "index:units".
    [Theory]
    [InlineData(1UL,
        "0/2 700/3 0/2 150/3 1000/3 500/3 0/2 100/3 0/2 0/1 50/3 0/2 0/1 0/0",
        "0:500 1:1000 3:100 5:100 6:500 8:50 10:50 13:200", 2_500)]
    [InlineData(2UL, "0/2 0/1 0/0", "", 0)]
    [InlineData(3UL,
        "300/3 50/3 0/2 0/1 300/3 0/2 100/3 0/2 500/3 0/2 0/1 0/0",
        "0:50 2:50 3:50 4:200 6:500 9:200 10:50 11:50 14:100", 1_250)]
    [InlineData(57_472UL,
        "200/3 0/2 0/1 200/3 50/3 1200/3 150/3 0/2 50/3 250/3 500/3 100/3 0/2 0/1 100/3 0/2 50/3 0/2 50/3",
        "0:50 1:100 2:50 3:50 4:100 5:500 6:50 7:50 8:200 9:1000 10:200 11:100 12:250 13:100 14:100", 1_002_900)]
    public void GoldenRoundsFromFixedSeeds(ulong seed, string turns, string cells, int award)
    {
        var round = Play(new Pcg32Random(seed));

        Assert.Equal(turns, RoundText.Turns(round));
        Assert.Equal(cells, RoundText.Cells(round));
        Assert.Equal(award, round.Award);
    }
}
