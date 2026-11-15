const string usage = """
    usage: lab <command>

    No commands exist yet.
    """;

if (args is ["-h" or "--help"])
{
    Console.WriteLine(usage);
    return 0;
}

if (args.Length > 0)
    Console.Error.WriteLine($"unknown command: {args[0]}");
Console.Error.WriteLine(usage);
return 1;
