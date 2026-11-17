using LastBreath.Core;
using LastBreath.Core.Analysis;

namespace LastBreath.Tests;

[Trait("Category", "Analysis")]
public sealed class ClassicSolverTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();
    private static readonly DiveConfig Classic = Default.Dives["Classic"];

    // p = 34,060 / 1,000,000 = 1,703 / 50,000, so a cell stays empty with chance 48,297 / 50,000.
    [Fact]
    public void OneEmptyCellWithThreeBreathsFillsUnlessThreeSpinsMiss()
    {
        var (final, spins) = ClassicSolver.Table(Classic);

        Assert.Equal(1 - 112_657_592_294_073d / 125_000_000_000_000d, final[14, 3, 15], 1e-15);
        Assert.Equal(112_657_592_294_073d / 125_000_000_000_000d, final[14, 3, 14], 1e-15);
        Assert.Equal(7_247_450_209d / 2_500_000_000d, spins[14, 3], 1e-15);
    }

    [Fact]
    public void OneEmptyCellWithOneBreathGetsOneSpin()
    {
        var (final, spins) = ClassicSolver.Table(Classic);

        Assert.Equal(1_703d / 50_000d, final[14, 1, 15], 1e-15);
        Assert.Equal(1d, spins[14, 1]);
    }

    [Fact]
    public void AnEmptyBoardWithThreeDeadSpinsPaysNothing()
    {
        var solution = ClassicSolver.Solve(Default, Classic);

        Assert.Equal(Math.Pow(48_297d / 50_000d, 45), solution.FinalCrates[0], 1e-15);
    }

    [Fact]
    public void FinalCrateProbabilitiesSumToOne()
    {
        var solution = ClassicSolver.Solve(Default, Classic);

        Assert.Equal(16, solution.FinalCrates.Length);
        Assert.Equal(1, solution.FinalCrates.Sum(), 1e-14);
        Assert.All(solution.FinalCrates, chance => Assert.True(chance > 0));
    }

    [Fact]
    public void ReachableMaximumIsFifteenMajorsAndTheGrandAndStaysUnderTheCap()
    {
        var solution = ClassicSolver.Solve(Default, Classic);

        Assert.Equal(2_500_000, solution.ReachableMaxUnits);
        Assert.True(solution.ReachableMaxUnits < Default.Cap);
    }

    [Fact]
    public void MixedTableCoinMeanIsThePublishedOne()
    {
        var solution = ClassicSolver.Solve(Default, Classic);

        Assert.Equal(0.297, solution.CoinMean, 1e-15);
    }

    [Fact]
    public void AwardDistributionHasTheSameMomentsAsTheCrateCountFormula()
    {
        var solution = ClassicSolver.Solve(Default, Classic);

        var award = solution.AwardDistribution();
        var mean = award.Select((chance, i) => chance * i * 0.05).Sum();
        var square = award.Select((chance, i) => chance * Math.Pow(i * 0.05, 2)).Sum();

        Assert.Equal(1, award.Sum(), 1e-12);
        Assert.Equal(solution.Rtp, mean, 1e-12);
        Assert.Equal(solution.SecondMoment, square, 1e-9);
        Assert.Equal(solution.FinalCrates[0], award[0]);
    }
}
