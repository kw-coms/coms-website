package com.coms.backend.config;

import com.coms.backend.domain.ClubActivityCategory;
import com.coms.backend.repository.ClubActivityCategoryRepository;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Seeds the default club-activity categories when the table is empty. Production
 * is seeded by Flyway (V52); this guards the dev and test profiles where Flyway
 * is disabled and the schema is created by Hibernate. It is idempotent: it only
 * inserts when no categories exist, so it never duplicates the Flyway seed.
 */
@Component
@Order(0)
public class ClubActivityCategorySeeder implements ApplicationRunner {

    private static final List<String[]> DEFAULTS = List.of(
            new String[]{"GENERAL", "일반"},
            new String[]{"SEMINAR", "세미나"},
            new String[]{"STUDY", "스터디"},
            new String[]{"PROJECT", "프로젝트"},
            new String[]{"MEETING", "회의"},
            new String[]{"RECRUIT", "모집"},
            new String[]{"EVENT", "행사"},
            new String[]{"MT", "MT"},
            new String[]{"ACHIEVEMENT", "성과"}
    );

    private final ClubActivityCategoryRepository categoryRepository;

    public ClubActivityCategorySeeder(ClubActivityCategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (categoryRepository.count() > 0) return;
        for (int i = 0; i < DEFAULTS.size(); i++) {
            String[] entry = DEFAULTS.get(i);
            ClubActivityCategory category = new ClubActivityCategory();
            category.setKey(entry[0]);
            category.setName(entry[1]);
            category.setPosition(i);
            categoryRepository.save(category);
        }
    }
}
