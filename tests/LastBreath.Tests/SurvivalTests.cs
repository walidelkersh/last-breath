using LastBreath.Core;
using LastBreath.Web;

namespace LastBreath.Tests;

// The survival function is built in the browser from the final crate probabilities of the reports, so these tests hold it to the figures
// the solver wrote: the hit frequency, the reachable maximum and the RTP.
[Trait("Category", "Client")]
public sealed class SurvivalTests
{
    public static TheoryData<string> Dives => new() { "Classic", "Static", "Tank" };

    private static (GameConfig Config, DiveInfo Dive, Survival Survival) Of(string id)
    {
        var config = ConfigLoader.LoadDefault();
        var dive = Catalog.Load(config).First(info => info.Id == id);
        return (config, dive, Survival.For(config, dive));
    }

    [Theory]
    [MemberData(nameof(Dives))]
    public void TheChanceOfAnyWinIsTheHitFrequencyOfTheReport(string id)
    {
        var (_, dive, survival) = Of(id);

        Assert.Equal(dive.Figures.HitFrequency, survival.AtLeast(1), 12);
        Assert.Equal(1 - dive.Figures.HitFrequency, survival.Nothing, 12);
        Assert.Equal(1, survival.AtLeast(0));
    }

    [Theory]
    [MemberData(nameof(Dives))]
    public void TheChanceOfTheReachableMaximumIsTheChanceOfTheMostCratesAllOfTheTopCoin(string id)
    {
        var (config, dive, survival) = Of(id);
        var weights = config.WeightTables[config.Dives[id].WeightTable];
        var tiers = Enumerable.Range(0, weights.Length).Where(tier => weights[tier] > 0).ToArray();
        var top = tiers.MaxBy(config.Units);
        var topChance = (double)weights[top] / GameConfig.WeightTotal;
        var most = Array.FindLastIndex(dive.Figures.FinalCrates.ToArray(), chance => chance > 0);
        var maximum = most * config.Units(top) + (most == Board.Size ? config.Grand : 0);
        var expected = dive.Figures.FinalCrates[most] * Math.Pow(topChance, most);

        Assert.True(expected > 0);
        Assert.Equal(expected, survival.AtLeast(maximum), expected * 1e-9);
        Assert.Equal(0, survival.AtLeast(maximum + Survival.Step));
    }

    [Theory]
    [MemberData(nameof(Dives))]
    public void TheSurvivalFunctionNeverRises(string id)
    {
        var (_, _, survival) = Of(id);

        var before = 1.0;
        for (var units = 0; units < survival.Length * Survival.Step; units += Survival.Step)
        {
            var now = survival.AtLeast(units);
            Assert.True(now <= before, $"the chance of {units} units or more rises");
            Assert.InRange(now, 0, 1);
            before = now;
        }
    }

    [Theory]
    [MemberData(nameof(Dives))]
    public void TheMeanFromTheSurvivalFunctionIsTheRtpOfTheReport(string id)
    {
        var (_, dive, survival) = Of(id);

        Assert.Equal(dive.Figures.Rtp, survival.Mean, 9);
    }

    [Theory]
    [MemberData(nameof(Dives))]
    public void ABetOrMoreIsLessLikelyThanAnyWinAndTheChanceUnderTheBetIsTheGap(string id)
    {
        var (_, _, survival) = Of(id);
        var under = survival.AboveNothingBelow(RoundSummary.BetUnits);

        Assert.InRange(under, 0, 1);
        Assert.Equal(survival.AtLeast(1) - survival.AtLeast(RoundSummary.BetUnits), under, 15);
        Assert.Equal(1, survival.Nothing + under + survival.AtLeast(RoundSummary.BetUnits), 12);
    }

    [Fact]
    public void TheDistributionIsBuiltOncePerDiveAndFastEnoughNotToBeNoticed()
    {
        var config = ConfigLoader.LoadDefault();
        var dive = Catalog.Load(config).First(info => info.Id == "Classic");
        var watch = System.Diagnostics.Stopwatch.StartNew();
        var first = Survival.For(config, dive);
        var built = watch.ElapsedMilliseconds;

        Assert.Same(first, Survival.For(config, dive));
        Assert.True(built < 500, $"building one dive took {built} ms");
    }
}
