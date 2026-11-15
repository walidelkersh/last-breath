using LastBreath.Core;

namespace LastBreath.Tests;

[Trait("Category", "Common")]
public sealed class BoardTests
{
    [Theory]
    [InlineData(0, 0, 0)]
    [InlineData(0, 2, 2)]
    [InlineData(1, 0, 3)]
    [InlineData(2, 1, 7)]
    [InlineData(4, 2, 14)]
    public void IndexRunsDownEachColumnBeforeMovingRight(int column, int row, int expected)
    {
        Assert.Equal(expected, Board.Index(column, row));
    }

    [Theory]
    [InlineData(-1, 0)]
    [InlineData(5, 0)]
    [InlineData(0, -1)]
    [InlineData(0, 3)]
    public void IndexRejectsCoordinatesOffTheBoard(int column, int row)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => Board.Index(column, row));
    }

    [Fact]
    public void NewBoardIsEmpty()
    {
        var board = new Board();

        Assert.Equal(0, board.Occupied);
        Assert.Equal(0, board.Total);
        Assert.False(board.IsFull);
        Assert.True(board[Board.Index(4, 2)].IsEmpty);
    }

    [Fact]
    public void OccupiedCountsEverySymbolAndTotalAddsTheirUnits()
    {
        var board = new Board();
        board[0] = new Cell(CellKind.Cash, 50);
        board[7] = new Cell(CellKind.Jackpot, 5_000);
        board[14] = new Cell(CellKind.Captain, 250);

        Assert.Equal(3, board.Occupied);
        Assert.Equal(5_300, board.Total);
        Assert.False(board.IsFull);
    }

    [Fact]
    public void BoardIsFullOnlyWhenAllFifteenCellsAreOccupied()
    {
        var board = new Board();
        for (var index = 0; index < Board.Size - 1; index++)
            board[index] = new Cell(CellKind.Cash, 50);
        Assert.False(board.IsFull);

        board[Board.Size - 1] = new Cell(CellKind.Cash, 50);

        Assert.True(board.IsFull);
        Assert.Equal(750, board.Total);
    }

    [Fact]
    public void SnapshotIsACopyThatLaterChangesDoNotReach()
    {
        var board = new Board();
        board[3] = new Cell(CellKind.Cash, 100);

        var snapshot = board.Snapshot();
        board[3] = new Cell(CellKind.Cash, 200);
        board[4] = new Cell(CellKind.Cash, 50);

        Assert.Equal(15, snapshot.Length);
        Assert.Equal(new Cell(CellKind.Cash, 100), snapshot[3]);
        Assert.True(snapshot[4].IsEmpty);
    }
}
