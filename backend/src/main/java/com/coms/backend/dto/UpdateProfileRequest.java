package com.coms.backend.dto;

import jakarta.validation.constraints.Size;

/**
 * Profile update. A field that is absent from the request body is left as it is; a field that is
 * present — an explicit {@code null} included — replaces the stored value.
 *
 * <p>The distinction matters because not every client sends the whole profile. The member app
 * saves the font choice and the profile text from two different screens, each sending only its own
 * fields. While absence meant {@code null}, picking a font there erased the member's phone number,
 * interests and aspiration, and saving the profile reset the font. The website sends every field,
 * with {@code null} to clear one, and behaves exactly as before.
 *
 * <p>A class rather than a record: the setters are how presence is observed — Jackson calls one
 * only for a property that is in the body.
 */
public class UpdateProfileRequest {

    @Size(max = 20)
    private String phone;
    @Size(max = 2000)
    private String aspiration;
    @Size(max = 500)
    private String interests;
    private Long selectedFontId;
    @Size(max = 50)
    private String selectedBuiltinFontKey;

    private boolean phoneGiven;
    private boolean aspirationGiven;
    private boolean interestsGiven;
    private boolean fontChoiceGiven;

    /**
     * Every field given, as the website sends it. A factory and not a constructor: Jackson would
     * adopt an all-arguments constructor as its creator and mark every field as sent.
     */
    public static UpdateProfileRequest of(String phone, String aspiration, String interests,
                                          Long selectedFontId, String selectedBuiltinFontKey) {
        UpdateProfileRequest request = new UpdateProfileRequest();
        request.setPhone(phone);
        request.setAspiration(aspiration);
        request.setInterests(interests);
        request.setSelectedFontId(selectedFontId);
        request.setSelectedBuiltinFontKey(selectedBuiltinFontKey);
        return request;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
        this.phoneGiven = true;
    }

    public String getAspiration() {
        return aspiration;
    }

    public void setAspiration(String aspiration) {
        this.aspiration = aspiration;
        this.aspirationGiven = true;
    }

    public String getInterests() {
        return interests;
    }

    public void setInterests(String interests) {
        this.interests = interests;
        this.interestsGiven = true;
    }

    public Long getSelectedFontId() {
        return selectedFontId;
    }

    public void setSelectedFontId(Long selectedFontId) {
        this.selectedFontId = selectedFontId;
        this.fontChoiceGiven = true;
    }

    public String getSelectedBuiltinFontKey() {
        return selectedBuiltinFontKey;
    }

    public void setSelectedBuiltinFontKey(String selectedBuiltinFontKey) {
        this.selectedBuiltinFontKey = selectedBuiltinFontKey;
        this.fontChoiceGiven = true;
    }

    public boolean hasPhone() {
        return phoneGiven;
    }

    public boolean hasAspiration() {
        return aspirationGiven;
    }

    public boolean hasInterests() {
        return interestsGiven;
    }

    /**
     * The two font fields are one choice (an uploaded font, a built-in one, or neither), so either
     * of them being present means the choice is being set.
     */
    public boolean hasFontChoice() {
        return fontChoiceGiven;
    }
}
