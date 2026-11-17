using LastBreath.Core;
using LastBreath.Core.Dives;

namespace LastBreath.Tests;

[Trait("Category", "Tank")]
public sealed class TankDiveTests
{
    private const int Million = 1_000_000;

    // Outcome rolls for the three air tanks, from the landing thresholds 93,120, 101,120 and 104,120.
    private static readonly int[] Plus1 = [93_120];
    private static readonly int[] Plus2 = [101_120];
    private static readonly int[] Plus3 = [104_120];

    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private static Round Play(IRandomSource random) => TankDive.Play(Default, Default.Dives["Tank"], random);

    [Fact]
    public void FourDeadSpinsEndTheRound()
    {
        var random = new ScriptedRandom(Rolls.Miss(60));

        var round = Play(random);

        Assert.Equal("0/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal(0, round.Award);
        Assert.Equal(Enumerable.Repeat(Million, 60), random.Bounds);
    }

    [Fact]
    public void ACrateNeverRefillsTheBreaths()
    {
        int[] rolls =
        [
            .. Rolls.Crate(), .. Rolls.Miss(14),                                     // spin 1, cell 0 lands 50
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14),                 // spins 2 to 4
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("50/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal(50, round.Award);
    }

    [Fact]
    public void ATankAddsItsBreathsThenClearsAndItsCellCanLandOnTheNextSpin()
    {
        int[] rolls =
        [
            .. Plus1, .. Rolls.Miss(14),                                             // spin 1, a +1 tank in cell 0
            .. Rolls.Crate(), .. Rolls.Miss(14),                                     // spin 2, cell 0 is empty again and lands 50
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14),                 // spins 3 to 5
        ];
        var random = new ScriptedRandom(rolls);

        var round = Play(random);

        Assert.Equal("0/4(+1@0) 50/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.All(round.Turns[0].Cells, cell => Assert.True(cell.IsEmpty));
        Assert.Equal("0:50", RoundText.Cells(round));
        Assert.Equal(0, random.Remaining);
    }

    [Fact]
    public void ATankDrawnAfterTheThirdOneBecomesEmpty()
    {
        int[] rolls =
        [
            .. Plus1, .. Plus1, .. Plus1, .. Rolls.Miss(12),                         // spin 1, three tanks, breaths 4 - 1 + 3
            .. Plus3, .. Rolls.Miss(14),                                             // spin 2, a fourth tank is empty
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15), // spins 3 to 7
        ];
        var random = new ScriptedRandom(rolls);

        var round = Play(random);

        Assert.Equal("0/6(+1@0,+1@1,+1@2) 0/5 0/4 0/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Empty(round.Turns[1].AirTanks);
        Assert.Equal(Enumerable.Repeat(Million, 105), random.Bounds);
    }

    [Fact]
    public void SeveralTanksInOneSpinCountInCellOrderUpToTheLimit()
    {
        int[] rolls =
        [
            .. Plus1, .. Plus3, .. Plus2, .. Plus3, .. Rolls.Miss(11),               // spin 1, the tank in cell 3 is the fourth
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),                 // spins 2 to 4
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),                 // spins 5 to 7
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),                 // spins 8 to 10
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal(
            "0/9(+1@0,+3@1,+2@2) 0/8 0/7 0/6 0/5 0/4 0/3 0/2 0/1 0/0",
            RoundText.Turns(round));
    }

    [Fact]
    public void ATankOnTheLastBreathKeepsTheRoundGoing()
    {
        int[] rolls =
        [
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),                 // spins 1 to 3, breaths down to 1
            .. Plus2, .. Rolls.Miss(14),                                             // spin 4, breaths 1 - 1 + 2
            .. Rolls.Miss(15), .. Rolls.Miss(15),                                    // spins 5 and 6
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("0/3 0/2 0/1 0/2(+2@0) 0/1 0/0", RoundText.Turns(round));
    }

    [Fact]
    public void CratesAndATankInOneSpinBothApply()
    {
        int[] rolls =
        [
            .. Rolls.Crate(), .. Plus1, .. Rolls.Miss(13),                           // spin 1, a crate in cell 0 and a +1 tank in cell 1
            .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14), .. Rolls.Miss(14), // spins 2 to 5
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("50/4(+1@1) 0/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal("0:50", RoundText.Cells(round));
    }

    [Fact]
    public void ATankInTheLastEmptyCellDoesNotFillTheBoard()
    {
        int[] rolls =
        [
            .. Rolls.Crates(14), .. Plus3,                                           // spin 1, 14 crates and a +3 tank in cell 14
            .. Rolls.Miss(1), .. Rolls.Miss(1), .. Rolls.Miss(1),                    // spins 2 to 4
            .. Rolls.Miss(1), .. Rolls.Miss(1), .. Rolls.Miss(1),                    // spins 5 to 7
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("700/6(+3@14) 0/5 0/4 0/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal(14, round.Board.Occupied);
        Assert.Equal(0, round.GrandWin);
        Assert.Equal(700, round.Award);
    }

    [Fact]
    public void TheLongestRoundIsThirteenSpins()
    {
        int[] rolls =
        [
            .. Plus3, .. Rolls.Miss(14), .. Plus3, .. Rolls.Miss(14), .. Plus3, .. Rolls.Miss(14), // spins 1 to 3, breaths 6, 8, 10
            .. Plus3, .. Rolls.Miss(14),                                             // spin 4, a fourth +3 tank adds nothing
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),                 // spins 5 to 7
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),                 // spins 8 to 10
            .. Rolls.Miss(15), .. Rolls.Miss(15), .. Rolls.Miss(15),                 // spins 11 to 13
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal(13, round.Turns.Count);
        Assert.Equal(
            "0/6(+3@0) 0/8(+3@0) 0/10(+3@0) 0/9 0/8 0/7 0/6 0/5 0/4 0/3 0/2 0/1 0/0",
            RoundText.Turns(round));
    }

    [Fact]
    public void AFullBoardEndsTheRoundAtOnceAndForfeitsTheBreathsLeft()
    {
        var random = new ScriptedRandom(Rolls.Crates(15));

        var round = Play(random);

        Assert.Single(round.Turns);
        Assert.Equal(3, round.Clock);
        Assert.True(round.IsOver);
        Assert.Equal(1_000_750, round.Award);
        Assert.Equal(0, random.Remaining);
    }

    [Fact]
    public void OnlyAnAirTankHasBreaths()
    {
        Assert.Equal([1, 2, 3], new[] { Outcome.TankPlus1, Outcome.TankPlus2, Outcome.TankPlus3 }.Select(tank => tank.Breaths()));
        Assert.Throws<ArgumentOutOfRangeException>(() => Outcome.Crate.Breaths());
    }

    // Expected rounds come from a separate Python model of the draw order, not from this engine.
    // Each turn reads "win/breaths left" and "(+breaths@cell)" for each air tank, each cell "index:units".
    [Theory]
    [InlineData(1UL,
        "300/3 100/2 200/2(+1@7) 100/2(+1@5) 550/1 0/0",
        "0:100 1:50 2:50 4:500 6:50 9:50 12:100 13:100 14:250", 1_250)]
    [InlineData(4UL,
        "0/6(+1@6,+2@9) 50/7(+2@13) 0/6 100/5 200/4 100/3 0/2 0/1 0/0",
        "0:50 5:50 9:100 10:200 12:50", 450)]
    [InlineData(54UL,
        "650/3 50/2 500/1 100/4(+2@1,+1@3,+1@13) 150/3 0/2 250/1 0/0",
        "0:50 3:250 4:50 6:50 7:500 8:50 9:50 11:100 13:100 14:500", 1_700)]
    [InlineData(21_694UL,
        "50/3 100/4(+2@5) 50/3 300/2 50/1 500/2(+2@2) 300/1 50/0",
        "0:50 1:50 2:100 3:250 4:100 5:200 6:100 7:50 8:50 9:200 10:50 11:50 12:50 13:50 14:50", 1_001_400)]
    public void GoldenRoundsFromFixedSeeds(ulong seed, string turns, string cells, int award)
    {
        var round = Play(new Pcg32Random(seed));

        Assert.Equal(turns, RoundText.Turns(round));
        Assert.Equal(cells, RoundText.Cells(round));
        Assert.Equal(award, round.Award);
    }
}
