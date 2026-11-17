namespace LastBreath.Core.Tickets;

public static class TicketSymbol
{
    public const string Empty = "Empty";
    public const string CashOnReel = "CashOnReel";
    public const string Jackpot = "Jackpot";
}

public sealed record AirTank(int Col, int Row, int Plus);

// The board after one spin has fully resolved. Both grids are indexed [column][row].
public sealed class TicketTurn
{
    public string[][] Symbols { get; set; } = [];
    public int[][] CashOnReels { get; set; } = [];
    public int TurnWin { get; set; }
    public int ClockAfter { get; set; }
    public List<AirTank> AirTanks { get; set; } = [];

    public static TicketTurn From(Turn turn)
    {
        var symbols = new string[Board.Columns][];
        var values = new int[Board.Columns][];
        for (var col = 0; col < Board.Columns; col++)
        {
            symbols[col] = new string[Board.Rows];
            values[col] = new int[Board.Rows];
            for (var row = 0; row < Board.Rows; row++)
            {
                var cell = turn.Cells[Board.Index(col, row)];
                symbols[col][row] = SymbolOf(cell.Kind);
                values[col][row] = cell.Units;
            }
        }

        return new TicketTurn
        {
            Symbols = symbols,
            CashOnReels = values,
            TurnWin = turn.TurnWin,
            ClockAfter = turn.ClockAfter,
            AirTanks = [.. turn.AirTanks.Select(tank => new AirTank(tank.Index / Board.Rows, tank.Index % Board.Rows, tank.Outcome.Breaths()))],
        };
    }

    private static string SymbolOf(CellKind kind) => kind switch
    {
        CellKind.Empty => TicketSymbol.Empty,
        CellKind.Cash => TicketSymbol.CashOnReel,
        CellKind.Jackpot => TicketSymbol.Jackpot,
        _ => throw new InvalidOperationException($"a {kind} cell has no ticket symbol"),
    };
}
