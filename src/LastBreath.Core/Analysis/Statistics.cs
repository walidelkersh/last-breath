namespace LastBreath.Core.Analysis;

// One simulated figure next to its exact value. It agrees when the exact value is within 3 standard errors.
public sealed record Measure(double Simulated, double Exact, double StandardError, double Critical = Measure.Normal99)
{
    public const double Normal99 = 2.5758293035488986;

    // Two-sided 99% point of Student's t on 99 degrees of freedom, for the mean of 100 batch means.
    public const double StudentT99 = 2.626405457279879;

    public double Z => (Simulated - Exact) / StandardError;

    public bool WithinThreeSe => Math.Abs(Z) <= 3;

    public double Low99 => Simulated - Critical * StandardError;

    public double High99 => Simulated + Critical * StandardError;
}

public sealed record ChiSquare(double Statistic, int Freedom, double Limit)
{
    // Critical values at the 0.001 level for 1 to 15 degrees of freedom.
    private static readonly double[] Critical =
        [10.828, 13.816, 16.266, 18.467, 20.515, 22.458, 24.322, 26.124, 27.877, 29.588, 31.264, 32.909, 34.528, 36.123, 37.697];

    public bool Passed => Statistic < Limit;

    public static ChiSquare Of(AwardBucket[] buckets) =>
        Of(buckets.Select(bucket => (bucket.Expected, bucket.Observed)));

    // Neighbouring groups are pooled until each expects at least 5 rounds; a short tail joins the last group.
    public static ChiSquare Of(IEnumerable<(double Expected, long Observed)> cells)
    {
        var groups = new List<(double Expected, long Observed)>();
        var expected = 0.0;
        var seen = 0L;
        foreach (var cell in cells)
        {
            expected += cell.Expected;
            seen += cell.Observed;
            if (expected < 5) continue;
            groups.Add((expected, seen));
            (expected, seen) = (0, 0);
        }
        if (groups.Count > 0 && (expected > 0 || seen > 0))
            groups[^1] = (groups[^1].Expected + expected, groups[^1].Observed + seen);
        if (groups.Count < 2)
            throw new ArgumentException("fewer than two groups expect 5 rounds, so there is nothing to test");

        var statistic = groups.Sum(group => Math.Pow(group.Observed - group.Expected, 2) / group.Expected);
        return new ChiSquare(statistic, groups.Count - 1, Critical[groups.Count - 2]);
    }
}

// A range of awards, in multiples of the bet, with the rounds expected in it and the rounds seen.
public sealed record AwardBucket(double From, double To, double Expected, long Observed)
{
    // The edges come from the exact distribution, never from the simulation. A bucket closes once it
    // holds its share of the mass not yet placed, so every bucket expects about the same number of
    // rounds even though awards are lumpy (Classic pays nothing in a fifth of its rounds). The last
    // bucket also takes any simulated award above the exact maximum, which the chi-square then flags.
    // exact and observed are indexed by award in steps of 50 units.
    public static AwardBucket[] Of(double[] exact, long[] observed, long rounds, int count)
    {
        static double Credits(int step) => (double)step * ConfigLoader.UnitStep / 1000;

        var buckets = new List<AwardBucket>();
        var remaining = exact.Sum();
        var mass = 0.0;
        var seen = 0L;
        var from = 0;
        for (var step = 0; step < exact.Length; step++)
        {
            mass += exact[step];
            seen += observed[step];
            if (buckets.Count == count - 1 || mass < remaining / (count - buckets.Count)) continue;
            buckets.Add(new AwardBucket(Credits(from), Credits(step), mass * rounds, seen));
            remaining -= mass;
            (mass, seen, from) = (0, 0, step + 1);
        }
        buckets.Add(new AwardBucket(Credits(from), Credits(exact.Length - 1), mass * rounds, seen + observed[exact.Length..].Sum()));
        return [.. buckets];
    }
}
