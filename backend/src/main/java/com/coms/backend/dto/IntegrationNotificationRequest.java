package com.coms.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class IntegrationNotificationRequest {
    @NotBlank
    @Size(max = 50)
    private String recipientStudentId;

    @Size(max = 100)
    private String actorLabel;

    @NotBlank
    @Size(max = 300)
    private String message;

    @Size(max = 500)
    private String acceptUrl;

    private boolean sendEmail = true;

    public String getRecipientStudentId() { return recipientStudentId; }
    public void setRecipientStudentId(String recipientStudentId) { this.recipientStudentId = recipientStudentId; }
    public String getActorLabel() { return actorLabel; }
    public void setActorLabel(String actorLabel) { this.actorLabel = actorLabel; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public String getAcceptUrl() { return acceptUrl; }
    public void setAcceptUrl(String acceptUrl) { this.acceptUrl = acceptUrl; }
    public boolean isSendEmail() { return sendEmail; }
    public void setSendEmail(boolean sendEmail) { this.sendEmail = sendEmail; }
}
