package com.coms.backend.service;

import com.coms.backend.domain.BannedStudent;
import com.coms.backend.dto.BannedStudentResponse;
import com.coms.backend.repository.BannedStudentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
@Transactional
public class BannedStudentService {

    private final BannedStudentRepository bannedStudentRepository;

    public BannedStudentService(BannedStudentRepository bannedStudentRepository) {
        this.bannedStudentRepository = bannedStudentRepository;
    }

    public void ban(String studentId) {
        if (bannedStudentRepository.existsByStudentId(studentId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 차단된 학번입니다.");
        }
        bannedStudentRepository.save(new BannedStudent(studentId));
    }

    public void unban(String studentId) {
        BannedStudent entry = bannedStudentRepository.findByStudentId(studentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "차단 목록에 없는 학번입니다."));
        bannedStudentRepository.delete(entry);
    }

    @Transactional(readOnly = true)
    public boolean isBanned(String studentId) {
        return bannedStudentRepository.existsByStudentId(studentId);
    }

    @Transactional(readOnly = true)
    public List<BannedStudentResponse> listBanned() {
        return bannedStudentRepository.findAllByOrderByBannedAtDesc()
                .stream()
                .map(b -> new BannedStudentResponse(b.getId(), b.getStudentId(), b.getBannedAt()))
                .toList();
    }
}
