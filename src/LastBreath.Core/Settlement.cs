namespace LastBreath.Core;

public static class Settlement
{
    // Units are thousandths of the bet. Every payable value is a multiple of 50 units and every bet a
    // multiple of 0.20, so the result is always whole cents and decimal keeps it exact.
    public static decimal Credits(int units, decimal bet) => units * bet / 1000m;
}
