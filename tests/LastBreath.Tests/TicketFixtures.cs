using LastBreath.Core;
using LastBreath.Core.Dives;
using LastBreath.Core.Tickets;

namespace LastBreath.Tests;

// Tickets for the ticket tests. A scripted ticket comes from the real engine with fixed rolls, so
// the numbers in a test can be worked out by hand.
internal static class TicketFixtures
{
    public static readonly GameConfig Config = ConfigLoader.LoadDefault();

    // The seeds the engine tests pin, with each round's award. Several of them fill the board.
    public static readonly (string Feature, ulong Seed, int Award)[] Golden =
    [
        ("Classic", 1, 2_500), ("Classic", 2, 0), ("Classic", 3, 1_250), ("Classic", 57_472, 1_002_900),
        ("Static", 1, 1_250), ("Static", 2, 500), ("Static", 125_651, 1_001_450),
        ("Tank", 1, 1_250), ("Tank", 4, 450), ("Tank", 54, 1_700), ("Tank", 21_694, 1_001_400),
    ];

    private static readonly string ConfigHash = Config.Hash();

    private static readonly Dictionary<string, Func<GameConfig, DiveConfig, IRandomSource, Round>> Engines = new()
    {
        ["Classic"] = ClassicDive.Play,
        ["Static"] = DriftDive.Play,
        ["Tank"] = TankDive.Play,
    };

    public static Ticket Seeded(string feature, ulong seed) =>
        Make(feature, new Pcg32Random(seed), $"{feature}-{seed}", seed);

    public static Ticket Scripted(string feature, int[] rolls) => Make(feature, new ScriptedRandom(rolls), "scripted", 0);

    private static Ticket Make(string feature, IRandomSource random, string id, ulong seed)
    {
        var round = Engines[feature](Config, Config.Dives[feature], random);
        return Ticket.FromRound(feature, round, id, seed, ConfigHash);
    }

    // Every field of a ticket on one line per turn, for comparing two tickets without trusting JSON.
    public static string Describe(Ticket ticket) => string.Join('\n',
        [
            $"{ticket.TicketId} {ticket.FeatureName} seed {ticket.Seed} hash {ticket.ConfigHash} coin {ticket.CoinWin} grand {ticket.GrandWin} total {ticket.TotalWin}",
            .. ticket.FreeGamesTurns.Select(turn =>
                $"win {turn.TurnWin} clock {turn.ClockAfter} tanks {string.Join(',', turn.AirTanks)} " +
                string.Join(' ', turn.Symbols.SelectMany(column => column)) + " | " +
                string.Join(' ', turn.CashOnReels.SelectMany(column => column))),
        ]);
}
