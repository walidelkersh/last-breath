namespace LastBreath.Core;

public enum CellKind { Empty, Cash, Jackpot, Captain }

public readonly record struct Cell(CellKind Kind, int Units)
{
    public bool IsEmpty => Kind == CellKind.Empty;
}

public sealed class Board
{
    public const int Columns = 5;
    public const int Rows = 3;
    public const int Size = Columns * Rows;

    private readonly Cell[] _cells = new Cell[Size];

    public Cell this[int index]
    {
        get => _cells[index];
        set => _cells[index] = value;
    }

    public int Occupied
    {
        get
        {
            var count = 0;
            foreach (var cell in _cells)
                if (!cell.IsEmpty) count++;
            return count;
        }
    }

    public bool IsFull => Occupied == Size;

    public int Total
    {
        get
        {
            var units = 0;
            foreach (var cell in _cells) units += cell.Units;
            return units;
        }
    }

    public static int Index(int column, int row)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(column);
        ArgumentOutOfRangeException.ThrowIfNegative(row);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(column, Columns);
        ArgumentOutOfRangeException.ThrowIfGreaterThanOrEqual(row, Rows);
        return column * Rows + row;
    }

    public Cell[] Snapshot() => (Cell[])_cells.Clone();
}
