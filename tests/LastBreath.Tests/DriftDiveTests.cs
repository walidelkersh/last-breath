using LastBreath.Core;
using LastBreath.Core.Dives;

namespace LastBreath.Tests;

// Shallow table tier rolls used below: 0 is 50 units, 50,005 is 100, 99,855 is the Mini (5,000 units).
[Trait("Category", "Drift")]
public sealed class DriftDiveTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private static Round Play(IRandomSource random) => DriftDive.Play(Default, Default.Dives["Static"], random);

    [Fact]
    public void SixDeadSpinsPlayOutAndPayNothing()
    {
        var random = new ScriptedRandom(Rolls.Miss(90));

        var round = Play(random);

        Assert.Equal("0/5 0/4 0/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal(0, round.Award);
        Assert.Equal(0, random.Remaining);
    }

    [Fact]
    public void LandingsNeverChangeTheSpinCount()
    {
        int[] rolls =
        [
            .. Rolls.Crate(0), .. Rolls.Miss(14),                                   // spin 1, cell 0 lands 50
            .. Rolls.Miss(14),                                                      // spin 2
            .. Rolls.Miss(3), .. Rolls.Crate(50_005), .. Rolls.Crate(99_855), .. Rolls.Miss(9), // spin 3, cell 4 lands 100 and cell 5 a Mini
            .. Rolls.Miss(12), .. Rolls.Miss(12), .. Rolls.Miss(12),                // spins 4 to 6
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("50/5 0/4 5100/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal("0:50 4:100 5:5000", RoundText.Cells(round));
        Assert.Equal(5_150, round.Award);
    }

    [Fact]
    public void ASpinCanLandMoreThanFiveCrates()
    {
        int[] rolls =
        [
            .. Rolls.Crates(6), .. Rolls.Miss(9),  // spin 1, six crates of 50
            .. Rolls.Miss(9), .. Rolls.Miss(9), .. Rolls.Miss(9), .. Rolls.Miss(9), .. Rolls.Miss(9), // spins 2 to 6
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("300/5 0/4 0/3 0/2 0/1 0/0", RoundText.Turns(round));
        Assert.Equal(300, round.Award);
    }

    [Fact]
    public void AFullBoardBeforeTheSixthSpinEndsTheRoundAndSkipsTheRest()
    {
        int[] rolls =
        [
            .. Rolls.Crates(10), .. Rolls.Miss(5),  // spin 1
            .. Rolls.Miss(5),                       // spin 2
            .. Rolls.Crates(5),                     // spin 3, the last five cells land
        ];
        var random = new ScriptedRandom(rolls);

        var round = Play(random);

        Assert.Equal("500/5 0/4 250/3", RoundText.Turns(round));
        Assert.True(round.IsOver);
        Assert.Equal(1_000_750, round.Award);
        Assert.Equal(0, random.Remaining);
    }

    [Fact]
    public void AFullBoardInOneSpinEndsTheRoundAfterOneTurn()
    {
        var round = Play(new ScriptedRandom(Rolls.Crates(15)));

        Assert.Single(round.Turns);
        Assert.Equal(5, round.Clock);
        Assert.Equal(1_000_750, round.Award);
    }

    [Fact]
    public void AFullBoardOnTheSixthSpinStillPaysTheGrand()
    {
        int[] rolls =
        [
            .. Rolls.Crates(14), .. Rolls.Miss(1),                                   // spin 1, only cell 14 is left
            .. Rolls.Miss(1), .. Rolls.Miss(1), .. Rolls.Miss(1), .. Rolls.Miss(1), // spins 2 to 5
            .. Rolls.Crate(),                                                        // spin 6
        ];

        var round = Play(new ScriptedRandom(rolls));

        Assert.Equal("700/5 0/4 0/3 0/2 0/1 50/0", RoundText.Turns(round));
        Assert.Equal(1_000_750, round.Award);
    }

    // Expected rounds come from a separate Python model of the draw order, not from this engine.
    // Each turn reads "win/spins left" and each cell "index:units".
    [Theory]
    [InlineData(1UL,
        "300/5 100/4 200/3 100/2 550/1 0/0",
        "0:100 1:50 2:50 4:500 6:50 9:50 12:100 13:100 14:250", 1_250)]
    [InlineData(2UL,
        "0/5 50/4 0/3 300/2 100/1 50/0",
        "0:50 6:200 8:50 9:50 12:50 13:100", 500)]
    [InlineData(125_651UL,
        "200/5 600/4 0/3 300/2 350/1",
        "0:100 1:50 2:50 3:50 4:100 5:100 6:100 7:100 8:50 9:50 10:50 11:50 12:100 13:250 14:250", 1_001_450)]
    public void GoldenRoundsFromFixedSeeds(ulong seed, string turns, string cells, int award)
    {
        var round = Play(new Pcg32Random(seed));

        Assert.Equal(turns, RoundText.Turns(round));
        Assert.Equal(cells, RoundText.Cells(round));
        Assert.Equal(award, round.Award);
    }
}
