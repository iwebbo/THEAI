import asyncio
import time
import socket
import httpx
import paramiko
import subprocess
from icmplib import ping as icmp_ping
from datetime import datetime
from typing import Dict, Any, Optional


from models.server import Server, ServerStatus
from schemas.server import ServerCheck, MonitoringProtocol

class MonitoringService:
    @staticmethod
    async def check_icmp(ip_address: str, timeout: int = 2) -> Dict[str, Any]:
        """
        Vérifie la connectivité ICMP avec icmplib (non-privileged mode)
        """
        try:
            # icmplib peut fonctionner en mode non-privileged avec NET_RAW
            host = await asyncio.to_thread(
                icmp_ping, 
                ip_address, 
                count=2, 
                timeout=timeout,
                privileged=False  # Mode non-root avec NET_RAW
            )
            
            if host.is_alive:
                return {
                    "status": ServerStatus.ONLINE.value,
                    "response_time": int(host.avg_rtt),
                    "message": f"Server responds to ICMP ping in {int(host.avg_rtt)}ms"
                }
            else:
                return {
                    "status": ServerStatus.OFFLINE.value,
                    "response_time": None,
                    "message": "Server does not respond to ICMP ping"
                }
        except Exception as e:
            return {
                "status": ServerStatus.OFFLINE.value,
                "response_time": None,
                "message": f"ICMP check error: {str(e)}"
            }

    @staticmethod
    async def check_http(hostname: str, port: Optional[int] = None, path: str = "/", 
                        use_https: bool = False, timeout: int = 5) -> Dict[str, Any]:
        """
        Vérifie la connectivité HTTP/HTTPS à un serveur
        """
        # Determine protocol and default port
        protocol = "https" if use_https else "http"
        if port is None:
            port = 443 if use_https else 80
        
        url = f"{protocol}://{hostname}:{port}{path}"
        
        try:
            start_time = time.time()
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=timeout, follow_redirects=True)
            response_time = int((time.time() - start_time) * 1000)  # ms
            
            if response.status_code < 400:
                return {
                    "status": ServerStatus.ONLINE.value,
                    "response_time": response_time,
                    "message": f"HTTP status: {response.status_code}, response time: {response_time}ms"
                }
            else:
                return {
                    "status": ServerStatus.OFFLINE.value,
                    "response_time": response_time,
                    "message": f"HTTP error status: {response.status_code}"
                }
        except httpx.RequestError as e:
            return {
                "status": ServerStatus.OFFLINE.value,
                "response_time": None,
                "message": f"HTTP connection error: {str(e)}"
            }
        except Exception as e:
            return {
                "status": ServerStatus.OFFLINE.value,
                "response_time": None,
                "message": f"HTTP check error: {str(e)}"
            }

    @staticmethod
    async def check_ssh(hostname: str, port: int = 22, username: Optional[str] = None,
                      password: Optional[str] = None, key_path: Optional[str] = None,
                      timeout: int = 5) -> Dict[str, Any]:
        """
        Vérifie la connectivité SSH à un serveur
        """
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            start_time = time.time()
            
            # Choose authentication method
            connect_params = {
                "hostname": hostname,
                "port": port,
                "timeout": timeout,
                "allow_agent": False,
                "look_for_keys": False
            }
            
            if username:
                connect_params["username"] = username
                
                if password:
                    connect_params["password"] = password
                elif key_path:
                    connect_params["key_filename"] = key_path
            
            # For simple connectivity test, use the transport directly
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            sock.connect((hostname, port))
            
            # If credentials provided, attempt full authentication
            if username and (password or key_path):
                transport = paramiko.Transport(sock)
                transport.start_client()
                
                if password:
                    transport.auth_password(username, password)
                elif key_path:
                    key = paramiko.RSAKey.from_private_key_file(key_path)
                    transport.auth_publickey(username, key)
            
            response_time = int((time.time() - start_time) * 1000)  # ms
            
            return {
                "status": ServerStatus.ONLINE.value,
                "response_time": response_time,
                "message": f"SSH connection successful, response time: {response_time}ms"
            }
        except (paramiko.SSHException, socket.error) as e:
            return {
                "status": ServerStatus.OFFLINE.value,
                "response_time": None,
                "message": f"SSH connection error: {str(e)}"
            }
        except Exception as e:
            return {
                "status": ServerStatus.OFFLINE.value,
                "response_time": None,
                "message": f"SSH check error: {str(e)}"
            }
        finally:
            try:
                client.close()
            except:
                pass

    @staticmethod
    async def check_tcp(hostname: str, port: int, timeout: int = 5) -> Dict[str, Any]:
        """
        Vérifie la connectivité TCP sur un port spécifique
        
        Args:
            hostname: Hostname ou IP du serveur
            port: Port TCP à vérifier
            timeout: Timeout en secondes
            
        Returns:
            Dict avec status, response_time et message
        """
        try:
            start_time = time.time()
            
            # Créer une socket TCP
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            
            # Tenter de se connecter
            result = sock.connect_ex((hostname, port))
            
            response_time = int((time.time() - start_time) * 1000)  # ms
            
            # Fermer la socket
            sock.close()
            
            if result == 0:
                return {
                    "status": ServerStatus.ONLINE.value,
                    "response_time": response_time,
                    "message": f"TCP port {port} is open, response time: {response_time}ms"
                }
            else:
                return {
                    "status": ServerStatus.OFFLINE.value,
                    "response_time": None,
                    "message": f"TCP port {port} is closed or filtered"
                }
                
        except socket.timeout:
            return {
                "status": ServerStatus.OFFLINE.value,
                "response_time": None,
                "message": f"TCP connection to port {port} timed out after {timeout}s"
            }
        except socket.gaierror as e:
            return {
                "status": ServerStatus.OFFLINE.value,
                "response_time": None,
                "message": f"TCP check error - hostname resolution failed: {str(e)}"
            }
        except Exception as e:
            return {
                "status": ServerStatus.OFFLINE.value,
                "response_time": None,
                "message": f"TCP check error: {str(e)}"
            }


    @staticmethod
    async def check_server(server: Server) -> ServerCheck:
        """
        Vérifie l'état d'un serveur selon les protocoles configurés
        """
        results = []
        protocols = server.protocols.split(',')
        
        for protocol in protocols:
            if protocol == MonitoringProtocol.ICMP.value:
                result = await MonitoringService.check_icmp(server.ip_address)
                results.append(result)
            
            elif protocol == MonitoringProtocol.HTTP.value:
                result = await MonitoringService.check_http(
                    server.hostname, 
                    port=server.http_port,
                    path=server.http_path,
                    use_https=server.use_https
                )
                results.append(result)
            
            elif protocol == MonitoringProtocol.SSH.value:
                result = await MonitoringService.check_ssh(
                    server.hostname,
                    port=server.ssh_port,
                    username=server.ssh_username,
                    password=server.ssh_password,
                    key_path=server.ssh_key_path
                )
            elif protocol == MonitoringProtocol.TCP.value:
                result = await MonitoringService.check_tcp(
                server.hostname,
                port=server.tcp_port,
                timeout=server.tcp_timeout
                )
                results.append(result)
        
        # Aggregate results - a server is considered online if at least one protocol is online
        online_results = [r for r in results if r["status"] == ServerStatus.ONLINE.value]
        
        if online_results:
            # Server is online if at least one protocol check is successful
            status = ServerStatus.ONLINE.value
            # Use the fastest response time from successful checks
            response_times = [r["response_time"] for r in online_results if r["response_time"] is not None]
            response_time = min(response_times) if response_times else None
            messages = [r["message"] for r in results]
            message = " | ".join(messages)
        else:
            # All protocol checks failed
            status = ServerStatus.OFFLINE.value
            response_time = None
            messages = [r["message"] for r in results]
            message = " | ".join(messages)
        
        return ServerCheck(
            id=server.id,
            status=status,
            response_time=response_time,
            message=message,
            last_check=datetime.now()
        )