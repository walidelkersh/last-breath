using LastBreath.Core;
using LastBreath.Core.Analysis;
using LastBreath.Core.Dives;
using Xunit.Abstractions;

namespace LastBreath.Tests;

[Trait("Category", "Simulate")]
public sealed class SimulatorTests(ITestOutputHelper output)
{
    private const int Rounds = 20_000;

    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private static Solution Exact(string id) => Solvers.Solve(id, Default, Default.Dives[id]);

    // The seeds are pinned, not found by search: they are the ones the engine-against-solver tests already use.
    // Classic and Tank carry most of their variance in the Grand, which a run this short usually misses, so
    // the 3-SE check on the mean is not well calibrated at 20,000 rounds. Over 1,000 other seeds it failed for
    // about 6% of them in those two dives. At 10 million rounds the Grand lands hundreds of times.
    [Theory]
    [InlineData("Classic", 101UL)]
    [InlineData("Static", 202UL)]
    [InlineData("Tank", 303UL)]
    public void ARunPassesItsOwnChecks(string id, ulong seed)
    {
        var report = Simulator.Run(id, Default, Exact(id), Rounds, seed);

        output.WriteLine($"{id}: mean z {report.MeanAward.Z:F2}, batch z {report.MeanAwardByBatches.Z:F2}, " +
            $"hit z {report.HitFrequency.Z:F2}, spins z {report.MeanSpins.Z:F2}, " +
            $"crates chi-square {report.FinalCrates.Statistic:F2} on {report.FinalCrates.Freedom} df, " +
            $"award chi-square {report.Award.Statistic:F2} on {report.Award.Freedom} df");

        Assert.True(report.Passed);
        Assert.Equal(12, report.AwardBuckets.Length);
        Assert.Equal(Rounds, report.AwardBuckets.Sum(bucket => bucket.Observed));
        Assert.Equal(Rounds, report.AwardBuckets.Sum(bucket => bucket.Expected), 1e-6);
        Assert.Equal(Rounds, report.FinalCrateCounts.Sum());
    }

    [Fact]
    public void ARoundCountThatDoesNotDivideIntoBatchesStillPlaysEveryRound()
    {
        var report = Simulator.Run("Tank", Default, Exact("Tank"), 20_037, 303);

        Assert.Equal(20_037, report.FinalCrateCounts.Sum());
    }

    [Fact]
    public void TheSameSeedGivesTheSameReportAndAnotherSeedDoesNot()
    {
        var first = Simulator.Run("Static", Default, Exact("Static"), Rounds, 7).ToJson();

        Assert.Equal(first, Simulator.Run("Static", Default, Exact("Static"), Rounds, 7).ToJson());
        Assert.NotEqual(first, Simulator.Run("Static", Default, Exact("Static"), Rounds, 8).ToJson());
    }

    [Fact]
    public void AWrongMeanSpinsFailsTheSpinsCheckOnly()
    {
        var classic = Default.Dives["Classic"];
        var exact = Exact("Classic");
        var wrong = new Solution(Default, classic, exact.FinalCrates, exact.MeanSpins + 1);

        var report = Simulator.Run("Classic", Default, wrong, Rounds, 101);

        Assert.False(report.MeanSpins.WithinThreeSe);
        Assert.False(report.Passed);
        Assert.True(report.MeanAward.WithinThreeSe);
        Assert.True(report.FinalCrates.Passed);
    }

    [Fact]
    public void ACrateChanceThatIsTooHighInTheExactSolveFailsTheMeanAndBothChiSquares()
    {
        var classic = Default.Dives["Classic"];
        var wrong = ClassicSolver.Solve(Default, classic with { Landing = [classic.Landing[0] with { Numerator = 44_000 }] });

        var report = Simulator.Run("Classic", Default, wrong, Rounds, 101);

        Assert.False(report.MeanAward.WithinThreeSe);
        Assert.False(report.FinalCrates.Passed);
        Assert.False(report.Award.Passed);
        Assert.False(report.Passed);
    }

    [Fact]
    public void TooFewRoundsToFormBatchesAreRefused()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Simulator.Run("Classic", Default, Exact("Classic"), Simulator.MinimumRounds - 1, 101));
    }

    [Fact]
    public void ADiveWithoutAnEngineOrSolverIsRefused()
    {
        Assert.Throws<ArgumentException>(() => Engines.For("Free"));
        Assert.Throws<ArgumentException>(() => Solvers.Solve("Free", Default, Default.Dives["Classic"]));
    }
}
