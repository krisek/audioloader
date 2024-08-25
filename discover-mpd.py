#!python3

import socket
import struct
import sys
import redis
import ipaddress
import logging
import time
import json

mpd_port = 6600

def discover_mpd_servers(local_ip, local_net):
    """Scans the local network for MPD servers on port 6600 and returns a dictionary of discovered servers."""
    print('discovery started')
    servers = {}
    local_network = ipaddress.ip_network(local_net)
    for address in local_network.hosts():
        if str(address) != local_ip:  # Skip the script's own IP
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)  # Set a timeout to avoid hanging connections
                sock.connect((str(address), mpd_port))
                data = sock.recv(1024).decode()  # Read some data from the server
                if "OK MPD" in data:  # Check for MPD identification string
                    servers[str(address)] = {
                        'location': str(address) + '_6600',
                        'ip': str(address),
                        'last_seen': time.time(),
                        'name': str(address)
                    }
                    print(servers[str(address)])
                    try:
                        r = redis.Redis(host='localhost', port=6379, db=0, decode_responses=True)
                        r.set('upnp:player:' + str(address) + '_6600:data', json.dumps(servers[str(address)]))
                        r.set('upnp:player:' + str(address) + '_6600:last_seen', servers[str(address)]['last_seen'])
                    except Exception as e:
                        print(f"Error setting data in redis for {address}: {e}")
                    finally:
                        del r
                sock.close()
            except Exception as e:
                # Ignore errors, potential non-MPD server or unreachable host
                pass
    return servers

def main():
    """Main loop to continuously discover MPD servers."""
    if len(sys.argv) != 3:
        print("Usage: script.py <local_ip> <local_net>")
        sys.exit(1)

    local_ip = sys.argv[1]
    local_net = sys.argv[2]

    while True:
        discovered_servers = discover_mpd_servers(local_ip, local_net)
        print(f"Found MPD servers: {discovered_servers}")
        time.sleep(600)  # Scan for updates every 10 minutes

if __name__ == "__main__":
    main()
