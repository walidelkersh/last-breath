using LastBreath.Core;

namespace LastBreath.Web;

// One spin as the round screen shows it. Cells is the board after the spin, NewCells the indices that
// landed in it, and AirTanks the tanks that showed for this spin only. TanksLeft counts what is still spare.
public sealed record Spin(
    int Number,
    Cell[] Cells,
    int[] NewCells,
    Landed[] AirTanks,
    int ClockBefore,
    int ClockAfter,
    int TanksLeft)
{
    public int BoardUnits => Cells.Sum(cell => cell.Units);
}

// What the summary says about a finished round.
public sealed record RoundSummary(int Spins, int Crates, string[] Jackpots, bool Grand, int Units)
{
    // Ten times the bet. A unit is a thousandth of the bet.
    public const int BigWinUnits = 10_000;

    public bool BigWin => Units >= BigWinUnits;

    // One bet. The result plate has four states: nothing, less than the bet, the bet or more, and a big win.
    public const int BetUnits = 1_000;

    public string Kind => Units == 0 ? "zero" : BigWin ? "big" : Units < BetUnits ? "under" : "over";
}

public static class Replay
{
    // The engine plays the whole round at once. The screen reveals it a spin at a time from these.
    public static Spin[] Of(Round round, DiveConfig dive)
    {
        var spins = new Spin[round.Turns.Count];
        var before = new Cell[Board.Size];
        var clock = dive.StartingClock;
        var tanksLeft = dive.TankLimit ?? 0;

        for (var i = 0; i < spins.Length; i++)
        {
            var turn = round.Turns[i];
            tanksLeft -= turn.AirTanks.Length;
            var landed = Enumerable.Range(0, Board.Size).Where(index => before[index].IsEmpty && !turn.Cells[index].IsEmpty);
            spins[i] = new Spin(i + 1, turn.Cells, [.. landed], turn.AirTanks, clock, turn.ClockAfter, tanksLeft);
            before = turn.Cells;
            clock = turn.ClockAfter;
        }

        return spins;
    }

    public static RoundSummary Summary(GameConfig config, Round round)
    {
        var cells = Enumerable.Range(0, Board.Size).Select(index => round.Board[index]).ToArray();
        return new RoundSummary(
            round.Turns.Count,
            cells.Count(cell => cell.Kind == CellKind.Cash),
            [.. cells.Where(cell => cell.Kind == CellKind.Jackpot).Select(cell => Narration.Label(config, cell))],
            round.GrandWin > 0,
            round.Award);
    }
}
