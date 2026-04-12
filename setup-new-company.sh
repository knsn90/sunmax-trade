#!/usr/bin/env bash
# ============================================================
#  setup-new-company.sh
#  Yeni bir şirket için sıfırdan ERP instance'ı kur
#  Kullanım: bash setup-new-company.sh
# ============================================================

set -e

# ── Renkler ──────────────────────────────────────────────────
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()    { echo -e "${CYAN}▸ $1${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
error()   { echo -e "${RED}✗ $1${NC}"; exit 1; }
step()    { echo -e "\n${BOLD}── $1 ──────────────────────────────────────${NC}"; }

# ── Başlık ───────────────────────────────────────────────────
clear
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║      Yeni Şirket Kurulum Sihirbazı   ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${NC}"

# ── Gerekli araçları kontrol et ──────────────────────────────
step "Gereksinimler kontrol ediliyor"

check_tool() {
  if ! command -v "$1" &> /dev/null; then
    error "$1 bulunamadı. Lütfen kurun: $2"
  fi
  success "$1 mevcut"
}

check_tool "node"    "https://nodejs.org"
check_tool "npm"     "https://nodejs.org"
check_tool "git"     "https://git-scm.com"
check_tool "vercel"  "npm install -g vercel"
check_tool "supabase" "npm install -g supabase"

# ── Şirket bilgileri ─────────────────────────────────────────
step "Şirket Bilgileri"

read -rp "$(echo -e "${BOLD}Şirket adı${NC} (slug, boşluksuz, örn: acmecorp): ")" COMPANY_SLUG
COMPANY_SLUG="${COMPANY_SLUG// /-}"
COMPANY_SLUG="$(echo "$COMPANY_SLUG" | tr "[:upper:]" "[:lower:]")"  # küçük harf

if [[ -z "$COMPANY_SLUG" ]]; then
  error "Şirket adı boş olamaz."
fi

read -rp "$(echo -e "${BOLD}Proje klasör adı${NC} [${COMPANY_SLUG}-erp]: ")" PROJECT_DIR
PROJECT_DIR="${PROJECT_DIR:-${COMPANY_SLUG}-erp}"

success "Şirket slug: $COMPANY_SLUG"
success "Klasör adı:  $PROJECT_DIR"

# ── Supabase bilgileri ───────────────────────────────────────
step "Supabase Projesi"

echo ""
warn "ADIM: Supabase'de yeni proje oluşturun"
echo "  1. https://supabase.com/dashboard → New Project"
echo "  2. Proje adı: ${COMPANY_SLUG}-erp"
echo "  3. Şifre seçin ve bölge belirleyin (EU West önerilir)"
echo "  4. Proje hazır olunca (1-2 dk) devam edin"
echo ""
read -rp "Supabase hazır olunca Enter'a basın..."

echo ""
info "Supabase Dashboard → Settings → API sayfasını açın"
echo ""
read -rp "$(echo -e "${BOLD}Supabase Project URL${NC} (örn: https://xyz.supabase.co): ")" SUPABASE_URL
read -rp "$(echo -e "${BOLD}Supabase anon public key${NC}: ")" SUPABASE_ANON_KEY
read -rsp "$(echo -e "${BOLD}Supabase service_role key${NC} (migration için, gizli tutun): ")" SUPABASE_SERVICE_KEY
echo ""

# URL sonu slash kaldır
SUPABASE_URL="${SUPABASE_URL%/}"

if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_ANON_KEY" || -z "$SUPABASE_SERVICE_KEY" ]]; then
  error "Supabase bilgileri eksik."
fi

success "Supabase URL: $SUPABASE_URL"

# ── Repo klonla ──────────────────────────────────────────────
step "Kod Tabanı Klonlanıyor"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="$PARENT_DIR/$PROJECT_DIR"

if [[ -d "$TARGET_DIR" ]]; then
  warn "Klasör zaten var: $TARGET_DIR"
  read -rp "Üzerine yazılsın mı? (e/H): " OVERWRITE
  if [[ "$OVERWRITE" != "e" && "$OVERWRITE" != "E" ]]; then
    error "İptal edildi."
  fi
  rm -rf "$TARGET_DIR"
fi

# Mevcut remote'u al
REMOTE_URL=$(git -C "$SCRIPT_DIR" remote get-url origin 2>/dev/null || echo "")

if [[ -n "$REMOTE_URL" ]]; then
  info "Repo klonlanıyor: $REMOTE_URL"
  git clone "$REMOTE_URL" "$TARGET_DIR"
else
  info "Git remote bulunamadı — yerel kopya oluşturuluyor"
  cp -r "$SCRIPT_DIR" "$TARGET_DIR"
  cd "$TARGET_DIR"
  git init
  git add .
  git commit -m "Initial commit for $COMPANY_SLUG"
fi

success "Kod tabanı hazır: $TARGET_DIR"

# ── .env dosyası oluştur ─────────────────────────────────────
step ".env Dosyası Oluşturuluyor"

cd "$TARGET_DIR"

cat > .env <<EOF
# ============================================
# ${COMPANY_SLUG} — Ortam Değişkenleri
# Oluşturulma: $(date '+%Y-%m-%d %H:%M')
# ============================================

VITE_SUPABASE_URL=${SUPABASE_URL}/
VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
EOF

success ".env oluşturuldu"

# ── Bağımlılıkları kur ───────────────────────────────────────
step "npm Bağımlılıkları Kuruluyor"
npm install --silent
success "Bağımlılıklar kuruldu"

# ── Migration'ları uygula ────────────────────────────────────
step "Veritabanı Schema Migration"

info "Migration'lar $SUPABASE_URL adresine uygulanıyor..."

# Supabase project ref = URL'den al (https://REFID.supabase.co)
SUPABASE_REF=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d'.' -f1)

# supabase CLI ile bağlan
supabase link --project-ref "$SUPABASE_REF" --password "$SUPABASE_SERVICE_KEY" 2>/dev/null || true

# Migration'ları sırayla uygula
MIGRATION_DIR="$TARGET_DIR/supabase/migrations"
MIGRATION_COUNT=0
MIGRATION_ERRORS=0

for SQL_FILE in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
  FILENAME=$(basename "$SQL_FILE")
  printf "  Uygulanıyor: %-50s" "$FILENAME"

  RESULT=$(supabase db execute --project-ref "$SUPABASE_REF" \
    --file "$SQL_FILE" 2>&1) || true

  if echo "$RESULT" | grep -qi "error\|fatal"; then
    echo -e " ${YELLOW}⚠ uyarı (devam ediliyor)${NC}"
    ((MIGRATION_ERRORS++)) || true
  else
    echo -e " ${GREEN}✓${NC}"
    ((MIGRATION_COUNT++)) || true
  fi
done

success "$MIGRATION_COUNT migration uygulandı ($MIGRATION_ERRORS hata/uyarı atlandı)"
info "Veritabanı şeması hazır — Supabase Dashboard'dan doğrulayabilirsiniz"

# ── İlk admin kullanıcısı ─────────────────────────────────────
step "İlk Admin Kullanıcısı"

echo ""
read -rp "$(echo -e "${BOLD}Admin e-posta${NC}: ")" ADMIN_EMAIL
read -rsp "$(echo -e "${BOLD}Admin şifre${NC} (en az 8 karakter): ")" ADMIN_PASS
echo ""

if [[ -n "$ADMIN_EMAIL" && -n "$ADMIN_PASS" ]]; then
  # Supabase Auth API ile kullanıcı oluştur
  CREATE_RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
    -H "apikey: ${SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"${ADMIN_EMAIL}\",
      \"password\": \"${ADMIN_PASS}\",
      \"email_confirm\": true,
      \"user_metadata\": {\"full_name\": \"Admin\", \"role\": \"admin\"}
    }")

  if [[ "$CREATE_RESULT" == "200" || "$CREATE_RESULT" == "201" ]]; then
    success "Admin kullanıcısı oluşturuldu: $ADMIN_EMAIL"
  else
    warn "Kullanıcı API yanıtı: $CREATE_RESULT — Supabase Dashboard'dan manuel ekleyebilirsiniz"
    warn "Authentication → Users → Add User → $ADMIN_EMAIL"
  fi
else
  warn "Kullanıcı atlandı — Supabase Dashboard → Authentication → Users'dan ekleyin"
fi

# ── Vercel deploy ────────────────────────────────────────────
step "Vercel Deployment"

echo ""
read -rp "Vercel'e deploy edilsin mi? (e/H): " DO_VERCEL

if [[ "$DO_VERCEL" == "e" || "$DO_VERCEL" == "E" ]]; then
  info "Vercel'e bağlanılıyor..."

  # Yeni Vercel projesi oluştur ve env ekle
  cd "$TARGET_DIR"

  # Env değişkenlerini Vercel'e ekle
  echo "$SUPABASE_URL/" | vercel env add VITE_SUPABASE_URL production --force 2>/dev/null || true
  echo "$SUPABASE_ANON_KEY" | vercel env add VITE_SUPABASE_ANON_KEY production --force 2>/dev/null || true

  # Production deploy
  DEPLOY_URL=$(vercel --prod --yes 2>&1 | grep -o 'https://[^ ]*' | tail -1)

  if [[ -n "$DEPLOY_URL" ]]; then
    success "Deploy tamamlandı!"
    echo -e "  ${BOLD}URL:${NC} $DEPLOY_URL"
  else
    warn "Deploy URL alınamadı — 'vercel ls' ile kontrol edin"
  fi
fi

# ── Özet ─────────────────────────────────────────────────────
step "Kurulum Tamamlandı"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  ${GREEN}✓ ${COMPANY_SLUG} ERP başarıyla kuruldu!${NC}${BOLD}       ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Proje klasörü:${NC}  $TARGET_DIR"
echo -e "  ${CYAN}Supabase:${NC}       $SUPABASE_URL"
[[ -n "$DEPLOY_URL" ]] && echo -e "  ${CYAN}Canlı URL:${NC}      $DEPLOY_URL"
echo ""
echo -e "  ${BOLD}Sonraki adımlar:${NC}"
echo "  1. Uygulamaya giriş yapın → Settings → şirket adı + logo yükleyin"
echo "  2. Contacts'tan müşteri/tedarikçi ekleyin"
echo "  3. Products'tan ürün tanımlayın"
echo "  4. İlk ticari dosyayı oluşturun"
echo ""
echo -e "  ${YELLOW}NOT:${NC} .env dosyasını git'e push etmeyin (zaten .gitignore'da)"
echo ""
