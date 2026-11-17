namespace LastBreath.Core;

// The board as it stood once the turn had fully resolved. TurnWin is how much the board total moved.
// An air tank is gone from the board by then, so AirTanks is the only record of where one landed.
public sealed record Turn(Cell[] Cells, int TurnWin, int ClockAfter, Landed[] AirTanks);

// State every dive shares. A dive engine fills the board and calls EndTurn once per spin.
public sealed class Round
{
    private readonly GameConfig _config;
    private readonly List<Turn> _turns = [];
    private int _totalBeforeTurn;

    public Round(GameConfig config, DiveConfig dive)
    {
        _config = config;
        Clock = dive.StartingClock;
    }

    public Board Board { get; } = new();

    public int Clock { get; private set; }

    public IReadOnlyList<Turn> Turns => _turns;

    // A full board ends the round at once, with any breaths left forfeit.
    public bool IsOver => Board.IsFull || Clock <= 0;

    public int CoinWin => Board.Total;

    public int GrandWin => Board.IsFull ? _config.Grand : 0;

    public bool Clamped => CoinWin + GrandWin > _config.Cap;

    // The cap never binds with the shipped config. It is applied anyway so a wrong config cannot overpay.
    public int Award => Math.Min(CoinWin + GrandWin, _config.Cap);

    public void EndTurn(int clockAfter, Landed[]? airTanks = null)
    {
        var total = Board.Total;
        _turns.Add(new Turn(Board.Snapshot(), total - _totalBeforeTurn, clockAfter, airTanks ?? []));
        _totalBeforeTurn = total;
        Clock = clockAfter;
    }
}
