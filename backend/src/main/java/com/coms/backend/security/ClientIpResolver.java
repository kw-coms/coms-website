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
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(ClientIpResolver.class);

    private final Set<String> trustedProxies;
    private final java.util.concurrent.atomic.AtomicBoolean misconfigurationReported =
            new java.util.concurrent.atomic.AtomicBoolean();

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
        } else if (request.getHeader("X-Real-IP") != null && isPrivateAddress(remoteAddr)
                && misconfigurationReported.compareAndSet(false, true)) {
            // A private peer sending X-Real-IP is almost certainly the host proxy reaching the
            // container through the Docker gateway. Ignoring the header is correct, but then every
            // visitor shares that one address and the login/apply limits lock the whole site out
            // together. Say so once instead of failing silently.
            log.warn("X-Real-IP from untrusted peer {} was ignored, so all visitors share its address "
                    + "for rate limits. Add it to AUTH_TRUSTED_PROXY_IPS if it is the host reverse proxy.", remoteAddr);
        }
        return remoteAddr;
    }

    private static boolean isPrivateAddress(String value) {
        if (!isNumericIp(value)) return false;
        try {
            InetAddress address = InetAddress.getByName(value);
            return address.isSiteLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress();
        } catch (UnknownHostException ignored) {
            return false;
        }
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
