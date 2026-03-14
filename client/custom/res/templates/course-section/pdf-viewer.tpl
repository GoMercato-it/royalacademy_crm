<div style="text-align: center; padding: 24px 16px;">
    <button data-action="openReader" class="btn btn-primary" style="
        background: linear-gradient(135deg, #e94560 0%, #0f3460 100%);
        border: none;
        padding: 18px 48px;
        font-size: 17px;
        font-weight: 600;
        border-radius: 12px;
        letter-spacing: 0.5px;
        box-shadow: 0 6px 24px rgba(233, 69, 96, 0.35);
        transition: all 0.3s ease;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        line-height: 1;
        min-height: 56px;
    ">
        <i class="fas fa-book-reader" style="font-size: 20px;"></i>
        Leggi i materiali di studio
    </button>
    {{#unless hasPdf}}
    <div style="margin-top: 10px; color: #8a8a8a; font-size: 13px;">
        Il materiale potrebbe essere ancora in sincronizzazione, riprova tra pochi secondi se necessario.
    </div>
    {{/unless}}
</div>
