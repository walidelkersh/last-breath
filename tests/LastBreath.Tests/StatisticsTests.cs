using LastBreath.Core;
using LastBreath.Core.Analysis;

namespace LastBreath.Tests;

[Trait("Category", "Simulate")]
public sealed class StatisticsTests
{
    [Fact]
    public void ZScoreAndIntervalFollowFromTheStandardError()
    {
        var measure = new Measure(1.0, 0.9, 0.05);

        Assert.Equal(2.0, measure.Z, 1e-12);
        Assert.True(measure.WithinThreeSe);
        Assert.Equal(1.0 - 2.5758293035488986 * 0.05, measure.Low99, 1e-12);
        Assert.Equal(1.0 + 2.5758293035488986 * 0.05, measure.High99, 1e-12);
    }

    [Fact]
    public void ExactValueFourStandardErrorsAwayIsOutside()
    {
        Assert.False(new Measure(1.0, 0.8, 0.05).WithinThreeSe);
        Assert.False(new Measure(0.8, 1.0, 0.05).WithinThreeSe);
    }

    // Expected 2 and 3 pool into one group of 5, so the groups are (5, 7), (10, 8) and (10, 13).
    [Fact]
    public void CellsExpectingLessThanFivePoolWithTheirNeighbour()
    {
        var test = ChiSquare.Of([(2, 1), (3, 6), (10, 8), (10, 13)]);

        Assert.Equal(0.8 + 0.4 + 0.9, test.Statistic, 1e-12);
        Assert.Equal(2, test.Freedom);
        Assert.Equal(13.816, test.Limit);
        Assert.True(test.Passed);
    }

    [Fact]
    public void AShortTailJoinsTheLastGroup()
    {
        var test = ChiSquare.Of([(10, 9), (10, 12), (2, 3)]);

        Assert.Equal(0.1 + 0.75, test.Statistic, 1e-12);
        Assert.Equal(1, test.Freedom);
    }

    [Fact]
    public void TooFewRoundsToFormTwoGroupsCannotBeTested()
    {
        Assert.Throws<ArgumentException>(() => ChiSquare.Of([(2, 1), (2, 3)]));
        Assert.Throws<ArgumentException>(() => ChiSquare.Of([(6, 5), (2, 3)]));
    }

    [Fact]
    public void AStatisticAboveTheLimitFails()
    {
        Assert.False(ChiSquare.Of([(10, 25), (10, 5)]).Passed);
    }

    // Shares of the mass still to place: 1/3 closes at the first step (0.5), then 1/2 of the remaining
    // 0.5 closes at the second (0.25), and the last bucket takes what is left.
    [Fact]
    public void BucketsCloseOnTheirShareOfTheMassThatRemains()
    {
        var buckets = AwardBucket.Of([0.5, 0.25, 0.125, 0.125], [48, 27, 12, 13], 100, 3);

        Assert.Equal(
            [new AwardBucket(0, 0, 50, 48), new AwardBucket(0.05, 0.05, 25, 27), new AwardBucket(0.10, 0.15, 25, 25)],
            buckets);
    }

    [Fact]
    public void AnAwardAboveTheExactMaximumLandsInTheLastBucket()
    {
        var buckets = AwardBucket.Of([0.5, 0.25, 0.125, 0.125], [48, 27, 12, 10, 3], 100, 3);

        Assert.Equal(25, buckets[^1].Observed);
    }

    [Fact]
    public void TallyAddsUpAwardsHitsAndSpins()
    {
        var tally = new Tally(10);
        tally.Add(0, 0, 1);
        tally.Add(100, 1, 2);
        tally.Add(200, 2, 3);

        Assert.Equal(3, tally.Rounds);
        Assert.Equal(2, tally.Hits);
        Assert.Equal(0.1, tally.MeanAward, 1e-12);
        Assert.Equal(0.01, tally.AwardVariance, 1e-12);
        Assert.Equal(2, tally.MeanSpins, 1e-12);
        Assert.Equal(1, tally.SpinVariance, 1e-12);
        Assert.Equal([1, 1, 1], tally.Crates[..3]);
        Assert.Equal([1, 0, 1, 0, 1], tally.Awards[..5]);
    }

    // Drift ends in six spins unless the board fills first, which a thousand rounds will not show.
    [Fact]
    public void RoundsThatAllLastTheSameSpinsStillGetAStandardError()
    {
        var config = ConfigLoader.LoadDefault();
        var tally = new Tally(10);
        for (var round = 0; round < 1_000; round++)
            tally.Add(0, 0, 6);

        var spins = tally.MeanSpinsAgainst(DriftSolver.Solve(config, config.Dives["Static"]));

        Assert.Equal(0, tally.SpinVariance);
        Assert.Equal(1.0 / 1_000, spins.StandardError, 1e-15);
        Assert.True(spins.WithinThreeSe);
    }
}
