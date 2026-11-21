using LastBreath.Core;
using LastBreath.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");

var config = ConfigLoader.LoadDefault();
builder.Services.AddSingleton(config);
builder.Services.AddSingleton(Catalog.Load(config));

await builder.Build().RunAsync();
