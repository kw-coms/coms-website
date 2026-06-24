package com.coms.backend.web;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ListPaginationTest {

    private static final List<Integer> DATA = List.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);

    @Test
    void returnsFullArrayUnchangedWhenNoParams() {
        ResponseEntity<List<Integer>> response = ListPagination.paginate(DATA, null, null);

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isEqualTo(DATA);
        // No pagination header on the legacy (no-param) path so the response is byte-identical to before.
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isNull();
    }

    @Test
    void returnsRequestedSliceWithTotalHeaderWhenParamsPresent() {
        ResponseEntity<List<Integer>> response = ListPagination.paginate(DATA, 1, 3);

        assertThat(response.getBody()).containsExactly(3, 4, 5);
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("10");
    }

    @Test
    void defaultsMissingPageToZeroAndMissingSizeToDefault() {
        ResponseEntity<List<Integer>> sizeOnly = ListPagination.paginate(DATA, null, 4);
        assertThat(sizeOnly.getBody()).containsExactly(0, 1, 2, 3);

        ResponseEntity<List<Integer>> pageOnly = ListPagination.paginate(DATA, 0, null);
        // Default size (20) exceeds the list, so the whole list comes back as the slice.
        assertThat(pageOnly.getBody()).isEqualTo(DATA);
    }

    @Test
    void clampsOutOfRangePageToEmptySlice() {
        ResponseEntity<List<Integer>> response = ListPagination.paginate(DATA, 99, 5);

        assertThat(response.getBody()).isEmpty();
        assertThat(response.getHeaders().getFirst("X-Total-Count")).isEqualTo("10");
    }

    @Test
    void rejectsInvalidPageOrSize() {
        assertThatThrownBy(() -> ListPagination.paginate(DATA, -1, 5))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);

        assertThatThrownBy(() -> ListPagination.paginate(DATA, 0, 0))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
