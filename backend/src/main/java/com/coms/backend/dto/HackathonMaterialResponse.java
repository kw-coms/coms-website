package com.coms.backend.dto;

import com.coms.backend.domain.HackathonMaterial;

public record HackathonMaterialResponse(Long id, String projectId, String kind, String label,
                                        String originalName, String mimeType, Long fileSize, String url) {
    public static HackathonMaterialResponse from(HackathonMaterial material) {
        String url = material.getLegacyUrl() != null ? material.getLegacyUrl()
                : "/api/hackathon/events/" + material.getEventId() + "/materials/" + material.getId()
                + ("application/pdf".equals(material.getMimeType()) && material.getOriginalName().toLowerCase().endsWith(".pdf") ? "/inline.pdf" : "");
        return new HackathonMaterialResponse(material.getId(), material.getProjectId(), material.getKind(),
                material.getLabel(), material.getOriginalName(), material.getMimeType(), material.getFileSize(), url);
    }
}
