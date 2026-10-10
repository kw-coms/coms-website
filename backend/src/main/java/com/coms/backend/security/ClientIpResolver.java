package com.coms.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/** Uses the host proxy's overwritten X-Real-IP only when the immediate peer is trusted. */
@Component
public class ClientIpResolver {
    private final Set<String> trustedProxies;

    public ClientIpResolver(@Value("${auth.trusted-proxy-ips:127.0.0.1,::1,0:0:0:0:0:0:0:1}") String trustedProxyIps) {
        trustedProxies = Arrays.stream(trustedProxyIps.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
        if (trustedProxies.stream().anyMatch(value -> !isNumericIp(value))) {
            throw new IllegalArgumentException("auth.trusted-proxy-ips must contain only numeric IP addresses");
        }
    }

    public String resolve(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (remoteAddr == null || remoteAddr.isBlank()) return "unknown";
        if (trustedProxies.contains(remoteAddr)) {
            // The host nginx sets this to $remote_addr, replacing any client-supplied value.
            // X-Forwarded-For is deliberately ignored: its leftmost entry can be forged.
            String realIp = request.getHeader("X-Real-IP");
            if (realIp != null && isNumericIp(realIp.trim())) return realIp.trim();
        }
        return remoteAddr;
    }

    private static boolean isNumericIp(String value) {
        if (value == null || value.isBlank() || value.length() > 45) return false;
        if (value.contains(":")) {
            if (!value.matches("[0-9a-fA-F:.]+")) return false;
            try {
                return InetAddress.getByName(value) instanceof Inet6Address;
            } catch (UnknownHostException ignored) {
                return false;
            }
        }
        String[] octets = value.split("\\.", -1);
        if (octets.length != 4) return false;
        for (String octet : octets) {
            if (!octet.matches("[0-9]{1,3}") || Integer.parseInt(octet) > 255) return false;
        }
        return true;
    }
}
