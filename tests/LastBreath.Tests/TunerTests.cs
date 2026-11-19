using LastBreath.Core;
using LastBreath.Core.Analysis;

namespace LastBreath.Tests;

[Trait("Category", "Analysis")]
public sealed class TunerTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private static double Rtp(GameConfig config, string id, int numerator)
    {
        var dive = config.Dives[id];
        var landing = dive.Landing.Select((entry, at) => at == 0 ? entry with { Numerator = numerator } : entry);
        return Solvers.Solve(id, config, dive with { Landing = [.. landing] }).Rtp;
    }

    private static GameConfig WithCrate(string id, int numerator) =>
        Default with
        {
            Dives = new(Default.Dives)
            {
                [id] = Default.Dives[id] with
                {
                    Landing = [.. Default.Dives[id].Landing.Select((entry, at) => at == 0 ? entry with { Numerator = numerator } : entry)],
                },
            },
        };

    [Theory]
    [InlineData("Classic")]
    [InlineData("Static")]
    [InlineData("Tank")]
    public void TheConfigNumeratorIsTheClosestIntegerToTheTarget(string id)
    {
        var numerator = Default.Dives[id].Landing[0].Numerator;

        var tuning = Tuner.Tune(id, Default);

        Assert.Equal(numerator, tuning.New);
        Assert.Equal(tuning.RtpBefore, tuning.RtpAfter);
        Assert.InRange(Math.Abs(tuning.RtpAfter - Tuner.Target), 0, 0.00005);
        var distance = Math.Abs(Rtp(Default, id, numerator) - Tuner.Target);
        Assert.True(Math.Abs(Rtp(Default, id, numerator - 1) - Tuner.Target) > distance);
        Assert.True(Math.Abs(Rtp(Default, id, numerator + 1) - Tuner.Target) > distance);
    }

    [Theory]
    [InlineData("Classic", 20_000)]
    [InlineData("Static", 50_000)]
    [InlineData("Tank", 60_000)]
    public void ASearchFromAnotherNumeratorFindsTheSameOne(string id, int start)
    {
        var tuning = Tuner.Tune(id, WithCrate(id, start));

        Assert.Equal(start, tuning.Old);
        Assert.Equal(Default.Dives[id].Landing[0].Numerator, tuning.New);
        Assert.True(Math.Abs(tuning.RtpBefore - Tuner.Target) > 0.01);
        Assert.Equal(Rtp(Default, id, tuning.New), tuning.RtpAfter);
    }

    // Drift in closed form, solved for the real-valued landing chance by bisection: with q = 1 - (1 - p)^6
    // the RTP is 15 q times the coin mean plus the Grand times q^15. The best integer is next to the root.
    [Fact]
    public void DriftAgreesWithTheClosedForm()
    {
        var weights = Default.WeightTables[Default.Dives["Static"].WeightTable];
        var coinMean = Enumerable.Range(0, weights.Length).Sum(tier => Default.Units(tier) / 1000.0 * weights[tier] / 100_000);
        double Closed(double p)
        {
            var q = 1 - Math.Pow(1 - p, 6);
            return 15 * q * coinMean + Default.Grand / 1000.0 * Math.Pow(q, 15);
        }

        double low = 0, high = 1;
        for (var step = 0; step < 100; step++)
        {
            var middle = (low + high) / 2;
            if (Closed(middle) < Tuner.Target) low = middle; else high = middle;
        }
        var below = (int)Math.Floor(low * 1_000_000);
        var best = Math.Abs(Closed(below / 1e6) - Tuner.Target) < Math.Abs(Closed((below + 1) / 1e6) - Tuner.Target) ? below : below + 1;

        Assert.Equal(best, Tuner.Tune("Static", WithCrate("Static", 70_000)).New);
    }

    [Theory]
    [InlineData("Classic")]
    [InlineData("Static")]
    [InlineData("Tank")]
    public void RtpRisesWithTheCrateNumerator(string id)
    {
        var rtps = new[] { 1_000, 5_000, 20_000, 50_000, 90_000, 150_000, 300_000, 600_000, 900_000, 980_000 }
            .Select(numerator => Rtp(Default, id, numerator))
            .ToArray();

        Assert.Equal(rtps.Order(), rtps);
        Assert.Equal(rtps.Length, rtps.Distinct().Count());
    }

    [Fact]
    public void ATargetThatNoNumeratorReachesIsRefused()
    {
        var weights = new int[Default.TierCount];
        weights[0] = GameConfig.WeightTotal;
        var poor = Default with
        {
            Grand = 50,
            WeightTables = new(Default.WeightTables) { ["shallow"] = weights },
        };

        Assert.Throws<InvalidOperationException>(() => Tuner.Tune("Static", poor));
    }
}
