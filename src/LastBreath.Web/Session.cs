namespace LastBreath.Web;

public enum Tier { Nothing, Under, Over, Big }

// One finished round as the session panel keeps it.
public sealed record RoundResult(int Number, string Dive, decimal Bet, decimal Win)
{
    public decimal Multiple => Win / Bet;

    public Tier Tier => Win == 0 ? Tier.Nothing
        : Multiple < 1 ? Tier.Under
        : Multiple >= RoundSummary.BigWinUnits / 1000m ? Tier.Big
        : Tier.Over;

    public string TierName => Tier switch
    {
        Tier.Nothing => "Nothing",
        Tier.Under => "Under the bet",
        Tier.Over => "Over the bet",
        _ => "Big win",
    };
}

// What the page remembers about the rounds played since the page opened or the balance was last reset. It is not stored anywhere.
public sealed class Session
{
    public const int Shown = 12;

    // A share of a few rounds says nothing, so the page shows the return only from this round on.
    public const int ReturnFromRound = 10;

    private readonly List<RoundResult> recent = [];

    public int Rounds { get; private set; }
    public decimal Bet { get; private set; }
    public decimal Returned { get; private set; }
    public IReadOnlyList<RoundResult> Recent => recent;

    public double? Return => Bet == 0 ? null : (double)(Returned / Bet);

    public void Add(string dive, decimal bet, decimal win)
    {
        Rounds++;
        Bet += bet;
        Returned += win;
        recent.Add(new RoundResult(Rounds, dive, bet, win));
        if (recent.Count > Shown) recent.RemoveAt(0);
    }

    public void Clear()
    {
        Rounds = 0;
        Bet = 0;
        Returned = 0;
        recent.Clear();
    }

    // The height of a bar, from 0 to 1, on a scale that bends like a logarithm: ten bets fill it and one bet reaches a little under half.
    public static double Height(decimal multiple) =>
        Math.Min(1, Math.Log10(1 + 4 * (double)multiple) / Math.Log10(1 + 4 * 10));
}
