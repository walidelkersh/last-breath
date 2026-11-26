using LastBreath.Core;

namespace LastBreath.Web;

// The words for the live region, for tile names and for the summary. Money is credits at the bet in play.
public static class Narration
{
    public static string Label(GameConfig config, Cell cell)
    {
        if (cell.Kind == CellKind.Cash) return "Crate";
        if (cell.Units == config.Jackpots.Mini) return "Mini";
        return cell.Units == config.Jackpots.Minor ? "Minor" : "Major";
    }

    public static string Credits(int units, decimal bet) => $"{Format.Credits(Settlement.Credits(units, bet))} credits";

    public static string Landing(GameConfig config, string diveId, decimal bet, Spin spin)
    {
        var parts = new[]
        {
            $"Spin {spin.Number}.",
            Placed(config, bet, spin) is { } placed ? $"Landed: {placed}." : "Nothing landed.",
            Tanks(spin) is { } tanks ? $"{tanks}." : null,
            $"Board {Credits(spin.BoardUnits, bet)}.",
            Clock(config, diveId, spin),
        };
        return string.Join(' ', parts.OfType<string>());
    }

    // What the status column says of the latest spin. A spin that only landed an air tank did land something.
    public static string Latest(GameConfig config, decimal bet, Spin spin)
    {
        var placed = Placed(config, bet, spin);
        var tanks = Tanks(spin);
        if (placed is null && tanks is null) return "Nothing landed.";
        return string.Join(' ', new[] { placed is null ? null : $"Landed: {placed}.", tanks is null ? null : $"{tanks}." }.OfType<string>());
    }

    private static string? Placed(GameConfig config, decimal bet, Spin spin)
    {
        var landed = new List<string>();
        var crates = spin.NewCells.Where(index => spin.Cells[index].Kind == CellKind.Cash).ToArray();
        if (crates.Length > 0)
            landed.Add($"{Plural(crates.Length, "crate")} worth {Credits(crates.Sum(index => spin.Cells[index].Units), bet)}");
        foreach (var index in spin.NewCells.Where(index => spin.Cells[index].Kind == CellKind.Jackpot))
            landed.Add($"a {Label(config, spin.Cells[index])} worth {Credits(spin.Cells[index].Units, bet)}");
        return landed.Count == 0 ? null : string.Join(" and ", landed);
    }

    private static string? Tanks(Spin spin)
    {
        if (spin.AirTanks.Length == 0) return null;
        var breaths = spin.AirTanks.Select(tank => tank.Outcome.Breaths()).ToArray();
        return $"{(breaths.Length == 1 ? "Air tank" : "Air tanks")}, plus {string.Join(" and plus ", breaths)} {(breaths.Sum() == 1 ? "breath" : "breaths")}";
    }

    public static string Result(GameConfig config, decimal bet, RoundSummary outcome, bool skipped)
    {
        var jackpots = outcome.Jackpots.Length == 0 ? "none" : string.Join(", ", outcome.Jackpots);
        var grand = outcome.Grand ? $"Grand won, {Credits(config.Grand, bet)}" : "Grand not won";
        var times = Format.Multiple(outcome.Units);
        return $"{(skipped ? "Skipped to the end. " : "")}Round over after {Plural(outcome.Spins, "spin")}. "
            + $"Crates {outcome.Crates}, jackpots {jackpots}. {grand}. "
            + $"Total win {Credits(outcome.Units, bet)}, {times} times the bet.";
    }

    private static string Clock(GameConfig config, string diveId, Spin spin)
    {
        var dive = config.Dives[diveId];
        var last = spin.ClockAfter == 1 ? " Last breath." : "";
        return diveId switch
        {
            "Classic" => $"Oxygen {spin.ClockAfter} of {dive.RefillTo}.{last}",
            "Static" => $"Spins left {spin.ClockAfter} of {dive.StartingClock}.",
            _ => $"Air {spin.ClockAfter}. Spare tanks {spin.TanksLeft} of {dive.TankLimit}.{last}",
        };
    }

    private static string Plural(int count, string noun) => $"{count} {noun}{(count == 1 ? "" : "s")}";
}
