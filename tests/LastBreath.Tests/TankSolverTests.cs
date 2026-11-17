using LastBreath.Core;
using LastBreath.Core.Analysis;

namespace LastBreath.Tests;

[Trait("Category", "Analysis")]
public sealed class TankSolverTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();
    private static readonly DiveConfig Tank = Default.Dives["Tank"];

    [Fact]
    public void WithNoTanksAndAClassicRefillItSolvesToClassic()
    {
        var classic = Default.Dives["Classic"];
        var tankAsClassic = Tank with
        {
            WeightTable = classic.WeightTable,
            StartingClock = 3,
            Landing =
            [
                new LandingEntry { Outcome = Outcome.Crate, Numerator = classic.Landing[0].Numerator },
                new LandingEntry { Outcome = Outcome.TankPlus1, Numerator = 0 },
                new LandingEntry { Outcome = Outcome.TankPlus2, Numerator = 0 },
                new LandingEntry { Outcome = Outcome.TankPlus3, Numerator = 0 },
            ],
        };

        var expected = ClassicSolver.Solve(Default, classic);
        var actual = TankSolver.Solve(Default, tankAsClassic, refillTo: 3);

        for (var m = 0; m <= Board.Size; m++)
            Assert.Equal(expected.FinalCrates[m], actual.FinalCrates[m], 1e-15);
        Assert.Equal(expected.MeanSpins, actual.MeanSpins, 1e-14);
        Assert.Equal(expected.Rtp, actual.Rtp, 1e-14);
    }

    [Fact]
    public void WithNoCratesNothingLandsOnTheBoardAndTheRoundLastsFourSpinsPlusItsTanks()
    {
        var onlyPlusThree = Tank with
        {
            Landing = [new LandingEntry { Outcome = Outcome.TankPlus3, Numerator = 1_000_000 }],
        };

        var solution = TankSolver.Solve(Default, onlyPlusThree);

        Assert.Equal(1, solution.FinalCrates[0]);
        Assert.Equal(0, solution.HitFrequency);
        Assert.Equal(13, solution.MeanSpins, 1e-15);
    }

    [Fact]
    public void FinalCrateProbabilitiesSumToOne()
    {
        var solution = TankSolver.Solve(Default, Tank);

        Assert.Equal(1, solution.FinalCrates.Sum(), 1e-14);
        Assert.All(solution.FinalCrates, chance => Assert.True(chance > 0));
    }

    [Fact]
    public void ReachableMaximumIsFifteenMajorsAndTheGrandAndStaysUnderTheCap()
    {
        var solution = TankSolver.Solve(Default, Tank);

        Assert.Equal(2_500_000, solution.ReachableMaxUnits);
        Assert.True(solution.ReachableMaxUnits < Default.Cap);
    }

    [Fact]
    public void AwardDistributionHasTheSameMomentsAsTheCrateCountFormula()
    {
        var solution = TankSolver.Solve(Default, Tank);

        var award = solution.AwardDistribution();
        var mean = award.Select((chance, i) => chance * i * 0.05).Sum();
        var square = award.Select((chance, i) => chance * Math.Pow(i * 0.05, 2)).Sum();

        Assert.Equal(1, award.Sum(), 1e-12);
        Assert.Equal(solution.Rtp, mean, 1e-12);
        Assert.Equal(solution.SecondMoment, square, 1e-9);
    }
}
