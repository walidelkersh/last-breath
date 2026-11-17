using LastBreath.Core;

namespace LastBreath.Tests;

// Compact text for golden rounds, so a whole round fits on one line of a test.
internal static class RoundText
{
    // "win/clock" for each turn, for example "0/2 700/3". Air tanks follow as "(+2@9)": breaths and cell.
    public static string Turns(Round round) =>
        string.Join(' ', round.Turns.Select(turn => $"{turn.TurnWin}/{turn.ClockAfter}{Tanks(turn)}"));

    // "cell:units" for each occupied cell of the final board.
    public static string Cells(Round round) =>
        string.Join(' ', Enumerable.Range(0, Board.Size)
            .Where(index => !round.Board[index].IsEmpty)
            .Select(index => $"{index}:{round.Board[index].Units}"));

    private static string Tanks(Turn turn) => turn.AirTanks.Length == 0
        ? ""
        : $"({string.Join(',', turn.AirTanks.Select(tank => $"+{tank.Outcome.Breaths()}@{tank.Index}"))})";
}
