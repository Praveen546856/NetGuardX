import subprocess
import time
import platform
import re

CHECK_INTERVAL = 5


def get_default_gateway():
    """Automatically detect the preferred IPv4 default gateway."""

    if platform.system() != "Windows":
        return None

    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                (
                    "Get-NetRoute -DestinationPrefix '0.0.0.0/0' "
                    "| Where-Object {$_.NextHop -ne '0.0.0.0'} "
                    "| Sort-Object RouteMetric "
                    "| Select-Object -First 1 -ExpandProperty NextHop"
                ),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )

        gateway = result.stdout.strip()

        if re.fullmatch(
            r"(?:\d{1,3}\.){3}\d{1,3}",
            gateway
        ):
            return gateway

        return None

    except (subprocess.TimeoutExpired, OSError):
        return None


def check_device(ip_address):
    """Check whether a target responds to one ICMP ping."""

    command = [
        "ping",
        "-n", "1",
        "-w", "1000",
        ip_address,
    ]

    start_time = time.perf_counter()

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=3,
        )

        elapsed_ms = (
            time.perf_counter() - start_time
        ) * 1000

        if result.returncode == 0:
            return "ONLINE", round(elapsed_ms, 2)

        return "NO RESPONSE", None

    except subprocess.TimeoutExpired:
        return "NO RESPONSE", None

    except OSError:
        return "ERROR", None


def get_targets():
    """Build the current list of monitoring targets."""

    targets = {}

    gateway = get_default_gateway()

    if gateway:
        targets["Default Gateway"] = gateway

    targets["Cloudflare DNS"] = "1.1.1.1"
    targets["Google DNS"] = "8.8.8.8"

    # Add your own lab devices here when available.
    # Example:
    # targets["Lab PC"] = "192.168.10.10"
    # targets["Lab Server"] = "192.168.20.10"

    return targets


def main():
    print("=" * 65)
    print("          NETGUARD X - MULTI-DEVICE MONITOR")
    print("=" * 65)
    print(f"Monitoring interval: {CHECK_INTERVAL} seconds")
    print("Press Ctrl+C to stop.\n")

    previous_targets = {}

    try:
        while True:
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

            targets = get_targets()

            if not targets:
                print(
                    f"[{timestamp}] "
                    "No monitoring targets available."
                )

            for device_name, ip_address in targets.items():

                if previous_targets.get(device_name) != ip_address:
                    print(
                        f"\nTarget: {device_name} "
                        f"({ip_address})"
                    )

                status, elapsed_ms = check_device(ip_address)

                if elapsed_ms is not None:
                    print(
                        f"[{timestamp}] "
                        f"{device_name} | {ip_address} | "
                        f"{status} | "
                        f"Elapsed: {elapsed_ms} ms"
                    )
                else:
                    print(
                        f"[{timestamp}] "
                        f"{device_name} | {ip_address} | "
                        f"{status}"
                    )

                previous_targets[device_name] = ip_address

            print("-" * 65)

            time.sleep(CHECK_INTERVAL)

    except KeyboardInterrupt:
        print("\nMonitoring stopped.")
        print("NetGuard X shutdown complete.")


if __name__ == "__main__":
    main()