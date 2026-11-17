using LastBreath.Core;
using LastBreath.Core.Analysis;

namespace LastBreath.Tests;

[Trait("Category", "Analysis")]
public sealed class DriftSolverTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();
    private static readonly DiveConfig Drift = Default.Dives["Static"];

    // Mean spins is close to 6, where 1e-15 is less than one unit in the last place, hence 1e-14.
    [Fact]
    public void ClosedFormEqualsTheInduction()
    {
        var closed = DriftSolver.Solve(Default, Drift);
        var induction = DriftSolver.SolveByInduction(Default, Drift);

        for (var m = 0; m <= Board.Size; m++)
            Assert.Equal(closed.FinalCrates[m], induction.FinalCrates[m], 1e-15);
        Assert.Equal(closed.MeanSpins, induction.MeanSpins, 1e-14);
    }

    [Fact]
    public void ACellStaysEmptyOnlyIfAllSixSpinsMissIt()
    {
        var solution = DriftSolver.Solve(Default, Drift);

        var empty = Math.Pow(918_185d / 1_000_000d, 6);
        Assert.Equal(Math.Pow(empty, 15), solution.FinalCrates[0], 1e-15);
        Assert.Equal(Math.Pow(1 - empty, 15), solution.GrandProbability, 1e-15);
    }

    [Fact]
    public void ReachableMaximumIsFifteenMinorsAndTheGrandBecauseTheShallowTableHasNoMajor()
    {
        var solution = DriftSolver.Solve(Default, Drift);

        Assert.Equal(1_300_000, solution.ReachableMaxUnits);
        Assert.True(solution.ReachableMaxUnits < Default.Cap);
    }

    [Fact]
    public void AwardDistributionHasTheSameMomentsAsTheCrateCountFormula()
    {
        var solution = DriftSolver.Solve(Default, Drift);

        var award = solution.AwardDistribution();
        var mean = award.Select((chance, i) => chance * i * 0.05).Sum();
        var square = award.Select((chance, i) => chance * Math.Pow(i * 0.05, 2)).Sum();

        Assert.Equal(1, award.Sum(), 1e-12);
        Assert.Equal(solution.Rtp, mean, 1e-12);
        Assert.Equal(solution.SecondMoment, square, 1e-9);
    }
}
