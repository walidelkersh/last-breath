using System.Globalization;

namespace LastBreath.Web;

// One plain sentence on how likely the round that was just played is, from the exact award distribution of the solver.
public static class Odds
{
    // The line for a round that ended with this award. It says how often a dive does at least this well, because the count of cells
    // a round fills does not say how much it paid.
    public static string? Line(string diveName, double rtp, int units, Survival survival)
    {
        var kind = diveName.EndsWith(" Dive", StringComparison.Ordinal) ? diveName[..^5] : diveName;

        if (units == 0)
        {
            var every = survival.Nothing > 0 ? 1 / survival.Nothing : 0;
            if (every == 0) return null;
            var share = Format.Percent(rtp, 0);
            return every < 2
                ? $"More than half of all {kind} dives surface with nothing, and that is part of the {share}."
                : $"About 1 in {Rounded(every)} {kind} dives surfaces with nothing, and that is part of the {share}.";
        }

        if (units < RoundSummary.BetUnits)
        {
            var tenths = (int)Math.Round(survival.AboveNothingBelow(RoundSummary.BetUnits) * 10, MidpointRounding.AwayFromZero);
            return tenths switch
            {
                < 1 => $"Fewer than 1 in 10 {kind} dives return less than the bet.",
                >= 10 => $"Nearly every {kind} dive that pays returns less than the bet.",
                _ => $"About {tenths} in 10 {kind} dives return less than the bet.",
            };
        }

        var atLeast = survival.AtLeast(units);
        if (atLeast <= 0) return null;
        var often = 1 / atLeast;
        return often < 2
            ? $"A win of {Format.Multiple(units)}× or more comes in more than half of {kind} dives."
            : $"A win of {Format.Multiple(units)}× or more comes about 1 {kind} dive in {Rounded(often)}.";
    }

    // A whole number below ten, and two significant digits from ten up, so that nobody reads a false precision.
    public static string Rounded(double every)
    {
        var scale = every < 10 ? 1 : Math.Pow(10, Math.Floor(Math.Log10(every)) - 1);
        return (Math.Round(every / scale, MidpointRounding.AwayFromZero) * scale).ToString("N0", CultureInfo.InvariantCulture);
    }
}
