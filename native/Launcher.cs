using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal sealed class EngineManifest
{
    public long size { get; set; }
    public string sha256 { get; set; }
    public string[] chunks { get; set; }
}

internal sealed class PortableManifest
{
    public string runtimeDirectory { get; set; }
    public string platform { get; set; }
    public PortableFile[] files { get; set; }
}

internal sealed class PortableFile
{
    public string path { get; set; }
    public long size { get; set; }
    public string sha256 { get; set; }
}

internal static class Launcher
{
    [STAThread]
    private static int Main(string[] arguments)
    {
        bool verifyOnly = arguments.Length == 1 && arguments[0] == "--verify";
        try
        {
            var root = AppDomain.CurrentDomain.BaseDirectory;
            var portable = new JavaScriptSerializer().Deserialize<PortableManifest>(File.ReadAllText(Path.Combine(root, "portable-manifest.json")));
            var runtimeDirectory = String.IsNullOrEmpty(portable.runtimeDirectory) ? "runtime" : portable.runtimeDirectory;
            if (Path.GetFileName(runtimeDirectory) != runtimeDirectory || runtimeDirectory == "." || runtimeDirectory == "..")
                throw new IOException("运行目录清单无效。");
            if (portable.platform != "win32-x64" || portable.files == null || portable.files.Length == 0)
                throw new IOException("运行文件清单无效，请重新完整下载。");
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var file in portable.files)
            {
                if (String.IsNullOrEmpty(file.path) || Path.IsPathRooted(file.path) ||
                    (file.path != "MathPad.exe" && !file.path.StartsWith(runtimeDirectory + "/", StringComparison.Ordinal)))
                    throw new IOException("运行文件清单包含无效路径。");
                string filename = Path.GetFullPath(Path.Combine(root, file.path));
                if (!filename.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !names.Add(filename))
                    throw new IOException("运行文件清单包含无效或重复路径。");
                if (!File.Exists(filename) || new FileInfo(filename).Length != file.size)
                    throw new IOException("运行文件缺失或不完整：" + file.path);
                if (verifyOnly)
                    using (var input = File.OpenRead(filename))
                    using (var sha = SHA256.Create())
                        if (Hex(sha.ComputeHash(input)) != file.sha256)
                            throw new IOException("运行文件校验失败：" + file.path);
            }
            foreach (var required in new[] { "MathPad.exe", runtimeDirectory + "/engine.json", runtimeDirectory + "/resources/app.asar" })
                if (!names.Contains(Path.GetFullPath(Path.Combine(root, required))))
                    throw new IOException("运行文件清单缺少必要文件：" + required);
            if (verifyOnly) return 0;
            var runtime = Path.Combine(root, runtimeDirectory);
            var manifest = new JavaScriptSerializer().Deserialize<EngineManifest>(File.ReadAllText(Path.Combine(runtime, "engine.json")));
            var engine = Path.Combine(runtime, "MathPadHost.exe");
            var ready = Path.Combine(runtime, ".engine-ready");
            string mutexName;
            using (var sha = SHA256.Create()) mutexName = "Local\\MathPad.Launcher." + Hex(sha.ComputeHash(Encoding.UTF8.GetBytes(root.ToLowerInvariant())));
            using (var mutex = new Mutex(false, mutexName))
            {
                bool acquired;
                try { acquired = mutex.WaitOne(TimeSpan.FromSeconds(45)); }
                catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) throw new IOException("另一个启动窗口正在准备程序，请稍后重试。");
                try
                {
                    string signature = manifest.sha256;
                    bool valid = File.Exists(engine) && new FileInfo(engine).Length == manifest.size;
                    if (valid) signature += ":" + File.GetLastWriteTimeUtc(engine).Ticks.ToString(CultureInfo.InvariantCulture);
                    if (!valid || !File.Exists(ready) || File.ReadAllText(ready) != signature)
                    {
                        string staging = engine + "." + Process.GetCurrentProcess().Id + ".tmp";
                        try
                        {
                            using (var output = File.Create(staging))
                            {
                                foreach (var chunk in manifest.chunks)
                                {
                                    if (Path.GetFileName(chunk) != chunk) throw new IOException("运行包清单无效。");
                                    using (var input = File.OpenRead(Path.Combine(runtime, chunk)))
                                    using (var inflater = new DeflateStream(input, CompressionMode.Decompress)) inflater.CopyTo(output);
                                }
                            }
                            using (var input = File.OpenRead(staging))
                            using (var sha = SHA256.Create())
                                if (input.Length != manifest.size || Hex(sha.ComputeHash(input)) != manifest.sha256)
                                    throw new IOException("运行包校验失败，请重新完整下载并解压。");
                            if (File.Exists(engine)) File.Delete(engine);
                            File.Move(staging, engine);
                            File.WriteAllText(ready, manifest.sha256 + ":" + File.GetLastWriteTimeUtc(engine).Ticks.ToString(CultureInfo.InvariantCulture));
                        }
                        finally { if (File.Exists(staging)) File.Delete(staging); }
                    }
                }
                finally { mutex.ReleaseMutex(); }
            }
            var start = new ProcessStartInfo(engine, JoinArguments(arguments)) { WorkingDirectory = runtime, UseShellExecute = false };
            // Shells and developer tools may set these for their own Node/Electron process.
            // They must not turn the packaged application into a Node shell or disable ASAR.
            foreach (var name in new[] { "ELECTRON_RUN_AS_NODE", "ELECTRON_NO_ASAR", "NODE_OPTIONS", "NODE_PATH" })
                start.EnvironmentVariables.Remove(name);
            Process.Start(start);
            return 0;
        }
        catch (Exception error)
        {
            if (verifyOnly) { Console.Error.WriteLine(error.Message); return 1; }
            MessageBox.Show("无法启动 Math Pad。请将整个运行包下载并解压到可写目录，保留 portable-manifest.json 指定的运行文件夹。\n\n" + error.Message,
                "Math Pad", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }

    private static string JoinArguments(string[] arguments)
    {
        var result = new StringBuilder();
        foreach (var argument in arguments)
        {
            if (result.Length > 0) result.Append(' ');
            result.Append('"');
            int backslashes = 0;
            foreach (char character in argument)
            {
                if (character == '\\') { backslashes++; continue; }
                if (character == '"') result.Append('\\', backslashes * 2 + 1);
                else result.Append('\\', backslashes);
                result.Append(character);
                backslashes = 0;
            }
            result.Append('\\', backslashes * 2).Append('"');
        }
        return result.ToString();
    }

    private static string Hex(byte[] bytes)
    {
        return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant();
    }
}
