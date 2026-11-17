using System.Text.Json;
using System.Text.Json.Serialization;

namespace LastBreath.Core.Tickets;

// One finished round, in units.
public sealed class Ticket
{
    // Unknown fields are refused, so a field that belongs to another dive cannot ride along unchecked.
    private static readonly JsonSerializerOptions Json = new()
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public List<TicketTurn> FreeGamesTurns { get; set; } = [];
    public int TotalWin { get; set; }
    public string FeatureName { get; set; } = "";
    public string TicketId { get; set; } = "";
    public int CoinWin { get; set; }
    public int GrandWin { get; set; }
    public ulong Seed { get; set; }
    public string ConfigHash { get; set; } = "";

    // A round does not know which dive played it, so the caller names it by its key in the config.
    public static Ticket FromRound(string featureName, Round round, string ticketId, ulong seed, string configHash)
    {
        if (!round.IsOver)
            throw new ArgumentException("only a finished round can become a ticket", nameof(round));

        return new Ticket
        {
            FreeGamesTurns = [.. round.Turns.Select(TicketTurn.From)],
            TotalWin = round.CoinWin + round.GrandWin,
            FeatureName = featureName,
            TicketId = ticketId,
            CoinWin = round.CoinWin,
            GrandWin = round.GrandWin,
            Seed = seed,
            ConfigHash = configHash,
        };
    }

    public string ToJson() => JsonSerializer.Serialize(this, Json);

    public static Ticket FromJson(string json) =>
        JsonSerializer.Deserialize<Ticket>(json, Json) ?? throw new InvalidDataException("ticket is empty");
}
