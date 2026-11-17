namespace LastBreath.Core.Analysis;

// The exact result of one dive. Money is a multiple of the bet.
// In Classic, Drift and Tank the award depends only on the final crate count N, because crate tiers
// are i.i.d. and independent of where and when they land, so everything follows from P(N = m).
public sealed class Solution
{
    private readonly int[] _coinUnits;
    private readonly double[] _coinChances;
    private readonly int _grandUnits;

    public Solution(GameConfig config, DiveConfig dive, double[] finalCrates, double meanSpins)
    {
        var weights = config.WeightTables[dive.WeightTable];
        var tiers = Enumerable.Range(0, weights.Length).Where(tier => weights[tier] > 0).ToArray();
        _coinUnits = tiers.Select(config.Units).ToArray();
        _coinChances = tiers.Select(tier => (double)weights[tier] / GameConfig.WeightTotal).ToArray();
        _grandUnits = config.Grand;

        FinalCrates = finalCrates;
        MeanSpins = meanSpins;
        CoinMean = _coinUnits.Zip(_coinChances, (units, chance) => chance * units / 1000.0).Sum();
        CoinVariance = _coinUnits.Zip(_coinChances, (units, chance) => chance * Math.Pow(units / 1000.0 - CoinMean, 2)).Sum();
    }

    public double[] FinalCrates { get; }

    public double MeanSpins { get; }

    public double CoinMean { get; }

    public double CoinVariance { get; }

    public double Grand => _grandUnits / 1000.0;

    public double MeanCrates => Enumerable.Range(0, FinalCrates.Length).Sum(m => m * FinalCrates[m]);

    public double MeanSquareCrates => Enumerable.Range(0, FinalCrates.Length).Sum(m => (double)m * m * FinalCrates[m]);

    public double GrandProbability => FinalCrates[Board.Size];

    public double HitFrequency => 1 - FinalCrates[0];

    public double Rtp => CoinMean * MeanCrates + Grand * GrandProbability;

    public double SecondMoment =>
        MeanCrates * CoinVariance + CoinMean * CoinMean * MeanSquareCrates
        + 2 * Grand * CoinMean * Board.Size * GrandProbability + Grand * Grand * GrandProbability;

    public double Sd => Math.Sqrt(SecondMoment - Rtp * Rtp);

    public int ReachableMaxUnits
    {
        get
        {
            var most = Array.FindLastIndex(FinalCrates, chance => chance > 0);
            return most * _coinUnits.Max() + (most == Board.Size ? _grandUnits : 0);
        }
    }

    public double ReachableMax => ReachableMaxUnits / 1000.0;

    // Index i is an award of i × 50 units. N coins are convolved N times and mixed by P(N = m).
    public double[] AwardDistribution()
    {
        var step = ConfigLoader.UnitStep;
        var award = new double[ReachableMaxUnits / step + 1];
        var sum = new double[] { 1 };
        for (var m = 0; m < FinalCrates.Length; m++)
        {
            if (m > 0)
            {
                var next = new double[sum.Length + _coinUnits.Max() / step];
                for (var i = 0; i < sum.Length; i++)
                {
                    if (sum[i] == 0) continue;
                    for (var tier = 0; tier < _coinUnits.Length; tier++)
                        next[i + _coinUnits[tier] / step] += sum[i] * _coinChances[tier];
                }
                sum = next;
            }

            if (FinalCrates[m] == 0) continue;
            var shift = m == Board.Size ? _grandUnits / step : 0;
            for (var i = 0; i < sum.Length; i++)
                award[i + shift] += FinalCrates[m] * sum[i];
        }
        return award;
    }
}
