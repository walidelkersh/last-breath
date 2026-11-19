namespace LastBreath.Core.Analysis;

// What a run of rounds adds up to, and how it sits against the exact solve. Awards are counted per
// 50-unit step so the buckets can be fixed afterwards from the exact distribution.
public sealed class Tally(int awardSteps)
{
    public const int AwardBucketCount = 12;

    private Int128 _awardSquares;
    private long _spinSquares;

    public long Rounds { get; private set; }

    public long Hits { get; private set; }

    public long AwardUnits { get; private set; }

    public long Spins { get; private set; }

    public long[] Crates { get; } = new long[Board.Size + 1];

    public long[] Awards { get; } = new long[awardSteps];

    public double MeanAward => (double)AwardUnits / Rounds / 1000;

    // Sample variance, in multiples of the bet squared.
    public double AwardVariance => Variance(AwardUnits, _awardSquares) / 1e6;

    public double MeanSpins => (double)Spins / Rounds;

    public double SpinVariance => Variance(Spins, _spinSquares);

    public void Add(int award, int crates, int spins)
    {
        Rounds++;
        if (award > 0) Hits++;
        AwardUnits += award;
        _awardSquares += (Int128)award * award;
        Spins += spins;
        _spinSquares += (long)spins * spins;
        Crates[crates]++;
        Awards[award / ConfigLoader.UnitStep]++;
    }

    public Measure MeanAwardAgainst(Solution exact) =>
        new(MeanAward, exact.Rtp, Math.Sqrt(AwardVariance / Rounds));

    // The standard error is the one the exact hit frequency implies, as for any test of a proportion.
    public Measure HitFrequencyAgainst(Solution exact) =>
        new((double)Hits / Rounds, exact.HitFrequency, Math.Sqrt(exact.HitFrequency * (1 - exact.HitFrequency) / Rounds));

    // A run in which every round lasts the same number of spins has no spread, which would make the
    // standard error zero. Drift is like that: only a full board before spin 6 ends it early, and that
    // is rarer than one round in a million. The variance is floored at one round off by one spin.
    public Measure MeanSpinsAgainst(Solution exact) =>
        new(MeanSpins, exact.MeanSpins, Math.Sqrt(Math.Max(SpinVariance, 1.0 / Rounds) / Rounds));

    public ChiSquare CratesAgainst(Solution exact) =>
        ChiSquare.Of(exact.FinalCrates.Select((chance, count) => (chance * Rounds, Crates[count])));

    public AwardBucket[] AwardBucketsAgainst(Solution exact) =>
        AwardBucket.Of(exact.AwardDistribution(), Awards, Rounds, AwardBucketCount);

    private double Variance(long total, Int128 squares) =>
        ((double)squares - (double)total * total / Rounds) / (Rounds - 1);
}
