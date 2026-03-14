<style>
    .course-section-pdf-reader-wrap {
        text-align: center;
        padding: 16px 12px;
    }

    .course-section-pdf-open-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-height: 38px;
        max-width: 100%;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        line-height: 1.2;
        letter-spacing: 0.1px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .course-section-pdf-open-btn:hover,
    .course-section-pdf-open-btn:focus {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .course-section-pdf-open-btn .fas {
        font-size: 14px;
    }

    @media (max-width: 576px) {
        .course-section-pdf-open-btn {
            width: 100%;
            padding: 10px 12px;
        }
    }
</style>

<div class="course-section-pdf-reader-wrap">
    <button data-action="openReader" class="btn btn-primary course-section-pdf-open-btn">
        <i class="fas fa-book-reader"></i>
        Leggi i materiali di studio
    </button>
    {{#unless hasPdf}}
    <div style="margin-top: 10px; color: #8a8a8a; font-size: 13px;">
        Il materiale potrebbe essere ancora in sincronizzazione, riprova tra pochi secondi se necessario.
    </div>
    {{/unless}}
</div>
