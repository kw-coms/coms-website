package com.coms.backend.config;

import com.coms.backend.domain.ClubProject;
import com.coms.backend.domain.ClubProjectCategory;
import com.coms.backend.repository.ClubProjectCategoryRepository;
import com.coms.backend.repository.ClubProjectRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Seeds the default club-project categories and the migrated companionServices
 * projects when the tables are empty. Production is seeded by Flyway (V54); this
 * guards the dev and test profiles where Flyway is disabled and the schema is
 * created by Hibernate. It is idempotent: it only inserts when no rows exist, so
 * it never duplicates the Flyway seed.
 */
@Component
@Order(0)
public class ClubProjectCategorySeeder implements ApplicationRunner {

    private static final List<String[]> DEFAULT_CATEGORIES = List.of(
            new String[]{"WEBSITE", "웹사이트"},
            new String[]{"APP", "앱"},
            new String[]{"GAME", "게임"}
    );

    // {category, title, description, eyebrow, linkUrl, displayUrl}
    private static final List<String[]> DEFAULT_PROJECTS = List.of(
            new String[]{"WEBSITE", "COMS 월드컵", "둘 중 하나를 고르며 개발 언어, 야식, 밈, 세미나 주제의 최종 우승자를 뽑는 COMS 미니게임입니다.", "Worldcup", "https://coms.kw.ac.kr/worldcup/", "coms.kw.ac.kr/worldcup"},
            new String[]{"WEBSITE", "COMS 티어표", "언어, 프레임워크, 프로젝트, 활동 주제를 S/A/B/C/D로 나누고 공유하는 COMS 티어표 도구입니다.", "Tier board", "https://coms.kw.ac.kr/tier/", "coms.kw.ac.kr/tier"},
            new String[]{"WEBSITE", "Food Club", "부원들과 밥 약속과 맛집 후보를 가볍게 모으는 식사 모임 허브입니다.", "Meal loop", "https://coms.kw.ac.kr/foodclub/", "coms.kw.ac.kr/foodclub"},
            new String[]{"WEBSITE", "TeamMate", "스터디와 프로젝트 팀을 조건에 맞춰 빠르게 나누는 팀 편성 도구입니다.", "Team randomizer", "https://coms.kw.ac.kr/team-randomizer/", "coms.kw.ac.kr/team-randomizer"},
            new String[]{"WEBSITE", "Game Club", "동아리 안에서 함께 즐길 수 있는 작은 게임과 이벤트 공간입니다.", "Playground", "https://coms.kw.ac.kr/gameclub/", "coms.kw.ac.kr/gameclub"},
            new String[]{"WEBSITE", "KW Mate", "광운대 생활에 필요한 연결과 정보를 더 쉽게 찾도록 돕는 서비스입니다.", "Campus utility", "http://kwmate.com/", "kwmate.com"},
            new String[]{"WEBSITE", "Daily Coding", "매일 코딩 문제와 기록을 이어가며 학습 루틴을 만드는 연습 공간입니다.", "Practice", "https://dailycoding-final.com/", "dailycoding-final.com"},
            new String[]{"WEBSITE", "BugSnap", "오류 화면 스크린샷을 올리면 OCR로 텍스트를 추출해 GitHub Issue용 버그 리포트 초안을 만들어주는 도구입니다.", "Bug report", "https://coms.kw.ac.kr/BugSnap/", "coms.kw.ac.kr/BugSnap"},
            new String[]{"WEBSITE", "LogDoctor", "서버 에러 로그를 붙여넣으면 원인 후보와 확인·해결 절차를 정리해주는 개발자용 로그 분석 도구입니다.", "Log triage", "https://coms.kw.ac.kr/LogDoctor/", "coms.kw.ac.kr/LogDoctor"},
            new String[]{"WEBSITE", "PRDoctor", "GitHub PR 링크를 넣으면 변경 요약, 위험도, 보안 경고, 테스트 목록, 리뷰 코멘트 초안을 정리해주는 코드 리뷰 보조 도구입니다.", "PR review", "https://coms.kw.ac.kr/PRDoctor/", "coms.kw.ac.kr/PRDoctor"}
    );

    private static final String DEFAULT_MADE_BY = "최준혁";

    private final ClubProjectCategoryRepository categoryRepository;
    private final ClubProjectRepository projectRepository;

    public ClubProjectCategorySeeder(ClubProjectCategoryRepository categoryRepository,
                                     ClubProjectRepository projectRepository) {
        this.categoryRepository = categoryRepository;
        this.projectRepository = projectRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (categoryRepository.count() == 0) {
            for (int i = 0; i < DEFAULT_CATEGORIES.size(); i++) {
                String[] entry = DEFAULT_CATEGORIES.get(i);
                ClubProjectCategory category = new ClubProjectCategory();
                category.setKey(entry[0]);
                category.setName(entry[1]);
                category.setPosition(i);
                categoryRepository.save(category);
            }
        }
        if (projectRepository.count() == 0) {
            for (int i = 0; i < DEFAULT_PROJECTS.size(); i++) {
                String[] entry = DEFAULT_PROJECTS.get(i);
                ClubProject project = new ClubProject();
                project.setCategory(entry[0]);
                project.setTitle(entry[1]);
                project.setDescription(entry[2]);
                project.setEyebrow(entry[3]);
                project.setLinkUrl(entry[4]);
                project.setDisplayUrl(entry[5]);
                project.setMadeBy(DEFAULT_MADE_BY);
                project.setPosition(i);
                projectRepository.save(project);
            }
        }
    }
}
