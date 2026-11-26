using LastBreath.Core;
using LastBreath.Core.Analysis;

namespace LastBreath.Web;

// The chance of an award from the exact distribution of the solver, on its lattice of 50 units. It is built once for each dive, from the
// final crate probabilities of the report, by the same convolution the solver uses, so the page and the report cannot disagree.
public sealed class Survival
{
    public const int Step = 50;

    private static readonly Dictionary<string, Survival> Built = [];

    private readonly double _nothing;
    private readonly double[] _atLeast;

    // award[i] is the chance of an award of i × Step units.
    public Survival(double[] award)
    {
        _nothing = award[0];
        _atLeast = new double[award.Length];
        var tail = 0.0;
        for (var i = award.Length - 1; i >= 0; i--)
        {
            tail += award[i];
            _atLeast[i] = tail;
        }
    }

    // The chance of ending with nothing.
    public double Nothing => _nothing;

    // The chance of an award of at least this many units, which is zero above the largest award that can happen.
    public double AtLeast(int units)
    {
        if (units <= 0) return 1;
        var index = (units + Step - 1) / Step;
        return index >= _atLeast.Length ? 0 : _atLeast[index];
    }

    // The chance of an award below this many units, nothing included.
    public double Below(int units) => Math.Max(0, 1 - AtLeast(units));

    // The mean award in bets: the sum of the chances of at least each step above zero, times the size of a step.
    public double Mean
    {
        get
        {
            var sum = 0.0;
            for (var i = _atLeast.Length - 1; i >= 1; i--) sum += _atLeast[i];
            return sum * Step / 1000.0;
        }
    }

    public int Length => _atLeast.Length;

    public static Survival For(GameConfig config, DiveInfo info)
    {
        if (Built.TryGetValue(info.Id, out var built)) return built;
        var solution = new Solution(config, config.Dives[info.Id], [.. info.Figures.FinalCrates], info.Figures.MeanSpins);
        return Built[info.Id] = new Survival(solution.AwardDistribution());
    }
}
