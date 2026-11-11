package com.coms.backend.service;

import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;

final class AskEmailAddress {
    private AskEmailAddress() {}

    static boolean isValid(String address) {
        if (address == null || address.isBlank() || address.length() > 254
                || address.chars().anyMatch(Character::isISOControl)) return false;
        try {
            InternetAddress parsed = new InternetAddress(address, true);
            parsed.validate();
            return !parsed.isGroup() && address.equals(parsed.getAddress());
        } catch (AddressException ex) {
            return false;
        }
    }
}
