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

    public static readonly TicketValidator Validator = new(Config);

    // The outcome roll of a +2 air tank, from the landing thresholds 93,120, 101,120 and 104,120.
    public static readonly int[] Plus2 = [101_120];

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

    // Classic: "150/3 200/3 0/2 0/1 0/0". Crates of 50 and 100 land in cells 0 and 1, then 200 in cell 2.
    public static Ticket ClassicBase() => Scripted("Classic",
    [
        .. Rolls.Crate(0), .. Rolls.Crate(32_000), .. Rolls.Miss(13),
        .. Rolls.Crate(58_000), .. Rolls.Miss(12),
        .. Rolls.Miss(12), .. Rolls.Miss(12), .. Rolls.Miss(12),
    ]);

    // Static: "150/5 50/4 0/3 0/2 0/1 0/0". Crates of 50 and 100 land in cells 0 and 1, then 50 in cell 2.
    public static Ticket StaticBase() => Scripted("Static",
    [
        .. Rolls.Crate(0), .. Rolls.Crate(50_005), .. Rolls.Miss(13),
        .. Rolls.Crate(0), .. Rolls.Miss(12),
        .. Rolls.Miss(12), .. Rolls.Miss(12), .. Rolls.Miss(12), .. Rolls.Miss(12),
    ]);

    // Tank: "50/5(+2@0) 100/4 0/3 0/2 0/1 0/0". A +2 tank in cell 0 and a 50 crate in cell 1, then
    // cell 0 lands a 100 crate once the tank has cleared.
    public static Ticket TankBase() => Scripted("Tank",
    [
        .. Plus2, .. Rolls.Crate(0), .. Rolls.Miss(13),
        .. Rolls.Crate(50_000), .. Rolls.Miss(13),
        .. Rolls.Miss(13), .. Rolls.Miss(13), .. Rolls.Miss(13), .. Rolls.Miss(13),
    ]);

    public static TicketTurn Turn(this Ticket ticket, int turnNumber) => ticket.FreeGamesTurns[turnNumber - 1];

    public static void Put(this Ticket ticket, int turnNumber, int col, int row, string symbol, int value)
    {
        var turn = ticket.Turn(turnNumber);
        turn.Symbols[col][row] = symbol;
        turn.CashOnReels[col][row] = value;
    }

    // Adds a spin on top of the last board, landing cash crates given as (column, row, units).
    public static Ticket Append(this Ticket ticket, int clockAfter, params (int Col, int Row, int Units)[] landed)
    {
        var last = ticket.FreeGamesTurns[^1];
        var turn = new TicketTurn
        {
            Symbols = [.. last.Symbols.Select(column => column.ToArray())],
            CashOnReels = [.. last.CashOnReels.Select(column => column.ToArray())],
            TurnWin = landed.Sum(crate => crate.Units),
            ClockAfter = clockAfter,
        };
        foreach (var (col, row, units) in landed)
        {
            turn.Symbols[col][row] = TicketSymbol.CashOnReel;
            turn.CashOnReels[col][row] = units;
        }
        ticket.FreeGamesTurns.Add(turn);
        return ticket;
    }

    public static Ticket WithoutLastTurn(this Ticket ticket)
    {
        ticket.FreeGamesTurns.RemoveAt(ticket.FreeGamesTurns.Count - 1);
        return ticket;
    }

    public static void Passes(Ticket ticket) => Assert.Null(Record.Exception(() => Validator.ValidateTicket(ticket)));

    public static void Fails(Ticket ticket, string message) =>
        Assert.Equal(message, Assert.Throws<InvalidOperationException>(() => Validator.ValidateTicket(ticket)).Message);

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
