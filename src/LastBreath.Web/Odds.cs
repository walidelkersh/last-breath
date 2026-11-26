using System.Globalization;

namespace LastBreath.Web;

// One plain sentence on how likely the round that was just played is, from the exact figures of the solver report.
public static class Odds
{
    // crates is the number of cells the board ended with, jackpots included, and chance is the report's figure for it.
    public static string? Line(string diveName, double rtp, int crates, double chance)
    {
        if (chance <= 0) return null;

        var kind = diveName.EndsWith(" Dive", StringComparison.Ordinal) ? diveName[..^5] : diveName;
        var every = 1 / chance;
        if (crates == 0)
        {
            var share = Format.Percent(rtp, 0);
            return every < 2
                ? $"More than half of all {kind} dives surface with nothing, and that is part of the {share}."
                : $"About 1 in {Rounded(every)} {kind} dives surfaces with nothing, and that is part of the {share}.";
        }

        var count = crates == 1 ? "1 crate" : $"{crates} crates";
        return every < 2
            ? $"A {kind} dive ends with exactly {count} more often than not."
            : $"A {kind} dive ends with exactly {count} about 1 time in {Rounded(every)}.";
    }

    // A whole number below ten, and two significant digits from ten up, so that nobody reads a false precision.
    public static string Rounded(double every)
    {
        var scale = every < 10 ? 1 : Math.Pow(10, Math.Floor(Math.Log10(every)) - 1);
        return (Math.Round(every / scale, MidpointRounding.AwayFromZero) * scale).ToString("N0", CultureInfo.InvariantCulture);
    }
}
