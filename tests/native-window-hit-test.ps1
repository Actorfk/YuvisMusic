param([int]$TargetProcessId, [int]$ClientX = 600, [int]$ClientY = 20)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DragHitTest {
 [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
 [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam, uint flags, uint timeout, out UIntPtr result);
}
"@
$process = Get-Process -Id $TargetProcessId
$process.Refresh()
$window = $process.MainWindowHandle
if ($window -eq [IntPtr]::Zero) { throw 'No main window' }
$point = New-Object DragHitTest+POINT
$point.X = $ClientX
$point.Y = $ClientY
if (-not [DragHitTest]::ClientToScreen($window, [ref]$point)) { throw 'ClientToScreen failed' }
$packed = (($point.Y -band 65535) -shl 16) -bor ($point.X -band 65535)
$result = [UIntPtr]::Zero
$status = [DragHitTest]::SendMessageTimeout($window, 0x84, [IntPtr]::Zero, [IntPtr]$packed, 2, 2000, [ref]$result)
if ($status -eq [IntPtr]::Zero) { throw 'Hit test timed out' }
$result.ToUInt64()

