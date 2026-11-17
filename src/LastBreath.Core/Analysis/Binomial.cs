namespace LastBreath.Core.Analysis;

public static class Binomial
{
    public static double[] Pmf(int trials, double p)
    {
        var pmf = new double[trials + 1];
        var choose = 1.0;
        for (var k = 0; k <= trials; k++)
        {
            pmf[k] = choose * Math.Pow(p, k) * Math.Pow(1 - p, trials - k);
            choose = choose * (trials - k) / (k + 1);
        }
        return pmf;
    }
}
