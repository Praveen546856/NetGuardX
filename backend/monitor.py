
import csv
import os
import re
import time
import platform
import subprocess
import statistics
import ipaddress
from datetime import datetime

# =========================================================
# NETGUARD X - NETWORK PERFORMANCE MONITOR
# Module 4: Persistent CSV Logging
# =========================================================

CHECK_INTERVAL = 5
PING_COUNT = 4
PING_TIMEOUT_MS = 1000

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

LOG_DIR = os.path.join(BASE_DIR, "logs")
CSV_FILE = os.path.join(LOG_DIR, "network_history.csv")

CSV_HEADERS = [
    "timestamp",
    "device_name",
    "ip_address",
    "status",
    "packets_sent",
    "packets_received",
    "packets_lost",
    "packet_loss_percent",
    "min_latency_ms",
    "max_latency_ms",
    "avg_latency_ms",
]


# =========================================================
# 1. CSV INITIALIZATION
# =========================================================

def initialize_csv():
    """Create the log directory and CSV file if needed."""

    os.makedirs(LOG_DIR, exist_ok=True)

    if (
        not os.path.exists(CSV_FILE)
        or os.path.getsize(CSV_FILE) == 0
    ):
        with open(
            CSV_FILE,
            "w",
            newline="",
            encoding="utf-8"
        ) as file:
            writer = csv.DictWriter(
                file,
                fieldnames=CSV_HEADERS
            )
            writer.writeheader()

    print(f"CSV logging enabled: {CSV_FILE}")


# =========================================================
# 2. AUTOMATIC DEFAULT GATEWAY DETECTION
# =========================================================

def get_default_gateway():
    """Detect the preferred IPv4 default gateway on Windows."""

    if platform.system() != "Windows":
        return None

    command = [
        "powershell",
        "-NoProfile",
        "-Command",
        (
            "Get-NetRoute -DestinationPrefix '0.0.0.0/0' "
            "| Where-Object {$_.NextHop -ne '0.0.0.0'} "
            "| Sort-Object RouteMetric "
            "| Select-Object -First 1 -ExpandProperty NextHop"
        ),
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.returncode != 0:
            return None

        gateway = result.stdout.strip().splitlines()

        if not gateway:
            return None

        gateway = gateway[0].strip()

        try:
            ipaddress.IPv4Address(gateway)
            return gateway
        except ipaddress.AddressValueError:
            return None

    except (subprocess.TimeoutExpired, OSError):
        return None


# =========================================================
# 3. NETWORK PERFORMANCE TEST
# =========================================================

def ping_device(ip_address):
    """Measure reachability, packet loss and response latency."""

    command = [
        "ping",
        "-n", str(PING_COUNT),
        "-w", str(PING_TIMEOUT_MS),
        ip_address,
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=PING_COUNT * 2 + 5,
        )

        output = result.stdout

        received = 0
        latencies = []

        for line in output.splitlines():

            if not re.search(
                r"\bReply from\b",
                line,
                re.IGNORECASE
            ):
                continue

            # Ignore unreachable messages.
            if re.search(
                r"Destination host unreachable",
                line,
                re.IGNORECASE
            ):
                continue

            received += 1

            # Examples:
            # time=5ms
            # time<1ms

            match = re.search(
                r"\btime\s*([=<])\s*(\d+)\s*ms",
                line,
                re.IGNORECASE
            )

            if match:
                operator = match.group(1)
                value = float(match.group(2))

                if operator == "<" and value == 1:
                    value = 0.5

                latencies.append(value)

        lost = max(0, PING_COUNT - received)

        packet_loss = (
            lost / PING_COUNT
        ) * 100

        if received == 0:
            status = "NO RESPONSE"
        elif lost > 0:
            status = "PARTIAL LOSS"
        else:
            status = "ONLINE"

        if latencies:
            min_latency = min(latencies)
            max_latency = max(latencies)
            avg_latency = statistics.mean(latencies)
        else:
            min_latency = None
            max_latency = None
            avg_latency = None

        return {
            "status": status,
            "sent": PING_COUNT,
            "received": received,
            "lost": lost,
            "packet_loss": round(packet_loss, 2),
            "min_latency": min_latency,
            "max_latency": max_latency,
            "avg_latency": avg_latency,
        }

    except subprocess.TimeoutExpired:

        return {
            "status": "TIMEOUT",
            "sent": PING_COUNT,
            "received": 0,
            "lost": PING_COUNT,
            "packet_loss": 100.0,
            "min_latency": None,
            "max_latency": None,
            "avg_latency": None,
        }

    except OSError as error:

        return {
            "status": "ERROR",
            "sent": PING_COUNT,
            "received": 0,
            "lost": PING_COUNT,
            "packet_loss": 100.0,
            "min_latency": None,
            "max_latency": None,
            "avg_latency": None,
            "error": str(error),
        }


# =========================================================
# 4. MONITORING TARGETS
# =========================================================

def get_targets():
    """Build the list of devices and endpoints to monitor."""

    targets = {}

    gateway = get_default_gateway()

    if gateway:
        targets["Default Gateway"] = gateway

    targets["Cloudflare DNS"] = "1.1.1.1"
    targets["Google DNS"] = "8.8.8.8"

    # Later, add your Packet Tracer lab devices here.
    #
    # targets["Lab PC"] = "192.168.10.10"
    # targets["Lab Server"] = "192.168.20.10"

    return targets


# =========================================================
# 5. DISPLAY RESULTS
# =========================================================

def display_metrics(
    timestamp,
    device_name,
    ip_address,
    metrics
):
    """Display network metrics in the terminal."""

    print(f"\n[{timestamp}] Checking {device_name}")

    print(f"Device: {device_name}")
    print(f"IP Address: {ip_address}")
    print(f"Status: {metrics['status']}")

    print(
        f"Packets: Sent={metrics['sent']}, "
        f"Received={metrics['received']}, "
        f"Lost={metrics['lost']}"
    )

    print(
        f"Packet Loss: "
        f"{metrics['packet_loss']}%"
    )

    if metrics["avg_latency"] is not None:

        print(
            f"Minimum Latency: "
            f"{metrics['min_latency']:.2f} ms"
        )

        print(
            f"Maximum Latency: "
            f"{metrics['max_latency']:.2f} ms"
        )

        print(
            f"Average Latency: "
            f"{metrics['avg_latency']:.2f} ms"
        )

    else:
        print("Latency: No successful ping replies")

    print("-" * 60)


# =========================================================
# 6. SAVE RESULTS TO CSV
# =========================================================

def save_to_csv(
    timestamp,
    device_name,
    ip_address,
    metrics
):
    """Append each monitoring result to persistent CSV history."""

    row = {
        "timestamp": timestamp,
        "device_name": device_name,
        "ip_address": ip_address,
        "status": metrics["status"],
        "packets_sent": metrics["sent"],
        "packets_received": metrics["received"],
        "packets_lost": metrics["lost"],
        "packet_loss_percent": metrics["packet_loss"],
        "min_latency_ms": metrics["min_latency"],
        "max_latency_ms": metrics["max_latency"],
        "avg_latency_ms": metrics["avg_latency"],
    }

    try:
        with open(
            CSV_FILE,
            "a",
            newline="",
            encoding="utf-8"
        ) as file:

            writer = csv.DictWriter(
                file,
                fieldnames=CSV_HEADERS
            )

            writer.writerow(row)

    except OSError as error:
        print(f"CSV logging error: {error}")


# =========================================================
# 7. MAIN MONITORING LOOP
# =========================================================

def main():

    initialize_csv()

    print("=" * 60)
    print("       NETGUARD X - NETWORK MONITOR")
    print("=" * 60)

    print(f"Monitoring interval: {CHECK_INTERVAL} seconds")
    print(f"Ping requests per target: {PING_COUNT}")
    print("CSV history: Enabled")
    print("Press Ctrl+C to stop.\n")

    try:

        while True:

            timestamp = datetime.now().strftime(
                "%Y-%m-%d %H:%M:%S"
            )

            targets = get_targets()

            if not targets:
                print(
                    f"[{timestamp}] "
                    "No default gateway detected."
                )

            for device_name, ip_address in targets.items():

                metrics = ping_device(ip_address)

                display_metrics(
                    timestamp,
                    device_name,
                    ip_address,
                    metrics
                )

                save_to_csv(
                    timestamp,
                    device_name,
                    ip_address,
                    metrics
                )

            print(
                f"\n[{timestamp}] "
                "Monitoring cycle completed."
            )

            time.sleep(CHECK_INTERVAL)

    except KeyboardInterrupt:

        print("\nMonitoring stopped.")
        print("NetGuard X shutdown complete.")
        print(f"History saved in: {CSV_FILE}")


# =========================================================
# 8. APPLICATION ENTRY POINT
# =========================================================

if __name__ == "__main__":
    main()
