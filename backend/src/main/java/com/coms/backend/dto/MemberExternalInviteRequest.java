package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public class MemberExternalInviteRequest {
    @NotEmpty
    @Size(max = 50)
    private List<@NotBlank @Size(max = 50) String> recipientStudentIds;

    @Size(max = 100)
    private String actorLabel;

    @NotBlank
    @Size(max = 300)
    private String message;

    @Size(max = 500)
    private String acceptUrl;

    public List<String> getRecipientStudentIds() { return recipientStudentIds; }
    public void setRecipientStudentIds(List<String> recipientStudentIds) { this.recipientStudentIds = recipientStudentIds; }
    public String getActorLabel() { return actorLabel; }
    public void setActorLabel(String actorLabel) { this.actorLabel = actorLabel; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public String getAcceptUrl() { return acceptUrl; }
    public void setAcceptUrl(String acceptUrl) { this.acceptUrl = acceptUrl; }
}
