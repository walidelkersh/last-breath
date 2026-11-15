namespace LastBreath.Core;

public enum Outcome { Empty, Crate, Bosun, Captain, TankPlus1, TankPlus2, TankPlus3 }

public static class OutcomeExtensions
{
    public static bool IsTank(this Outcome outcome) =>
        outcome is Outcome.TankPlus1 or Outcome.TankPlus2 or Outcome.TankPlus3;
}

public sealed record Jackpots
{
    public required int Mini { get; init; }
    public required int Minor { get; init; }
    public required int Major { get; init; }
}

public sealed record LandingEntry
{
    public required Outcome Outcome { get; init; }
    public required int Numerator { get; init; }
}

public sealed record DiveConfig
{
    public required string Name { get; init; }
    public required string WeightTable { get; init; }
    public required LandingEntry[] Landing { get; init; }
    public required int StartingClock { get; init; }
    public int? RefillTo { get; init; }
    public int? TankLimit { get; init; }
}

// Everything in config/dives.json. All money is in units, where 1 unit is 1/1000 of the bet.
// A weight table has one weight per tier: the cash ladder first, then Mini, Minor and Major.
public sealed record GameConfig
{
    public const int LandingDenominator = 1_000_000;
    public const int WeightTotal = 100_000;

    public required int[] CashLadder { get; init; }
    public required Jackpots Jackpots { get; init; }
    public required int Grand { get; init; }
    public required int Cap { get; init; }
    public required decimal[] Bets { get; init; }
    public required Dictionary<string, int[]> WeightTables { get; init; }
    public required Dictionary<string, DiveConfig> Dives { get; init; }

    public int TierCount => CashLadder.Length + 3;

    public int Units(int tier) => tier < CashLadder.Length
        ? CashLadder[tier]
        : (tier - CashLadder.Length) switch
        {
            0 => Jackpots.Mini,
            1 => Jackpots.Minor,
            _ => Jackpots.Major,
        };

    public Cell Crate(int tier) =>
        new(tier < CashLadder.Length ? CellKind.Cash : CellKind.Jackpot, Units(tier));
}
