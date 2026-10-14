import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import familyPhoto from '@assets/IMG_0461_1791978501312.PNG';
import communityPhoto from '@assets/IMG_0462_1791978501313.PNG';
import vaccinationPhoto from '@assets/IMG_0463_1791978501313.PNG';
import consultationPhoto from '@assets/IMG_0464_1791978501314.PNG';
import './hero-carousel.css';

type Language = 'en' | 'ta';
type Slide = {
  id: string;
  image: string;
  position: string;
  alt: Record<Language, string>;
  title: Record<Language, string>;
  description: Record<Language, string>;
};

const slides: Slide[] = [
  {
    id: 'family',
    image: familyPhoto,
    position: '62% 50%',
    alt: {
      en: 'A mother and daughter looking at a phone together in their village.',
      ta: 'ஒரு கிராமத்தில் தாயும் மகளும் கைப்பேசியைப் பார்த்துக் கொண்டிருக்கிறார்கள்.',
    },
    title: {
      en: 'Care that starts with the community',
      ta: 'சமூகத்திலிருந்தே தொடங்கும் பராமரிப்பு',
    },
    description: {
      en: 'A clear next step, close to home.',
      ta: 'வீட்டுக்கு அருகிலேயே அடுத்த தெளிவான படி.',
    },
  },
  {
    id: 'community',
    image: communityPhoto,
    position: '55% 50%',
    alt: {
      en: 'A community health worker speaking with a mother holding her child.',
      ta: 'குழந்தையைத் தாங்கியிருக்கும் தாயுடன் பேசும் சமூக சுகாதாரப் பணியாளர்.',
    },
    title: {
      en: 'Every handoff deserves a next step',
      ta: 'ஒவ்வொரு பரிந்துரைக்கும் அடுத்த படி தேவை',
    },
    description: {
      en: 'Keep families, care teams, and facilities connected.',
      ta: 'குடும்பங்கள், பராமரிப்புக் குழுக்கள், மையங்கள் இணைந்திருக்கட்டும்.',
    },
  },
  {
    id: 'vaccination',
    image: vaccinationPhoto,
    position: '57% 50%',
    alt: {
      en: 'A clinician providing a routine vaccination to an infant.',
      ta: 'குழந்தைக்கு வழக்கமான தடுப்பூசி செலுத்தும் சுகாதாரப் பணியாளர்.',
    },
    title: {
      en: 'Make the next visit easier to follow',
      ta: 'அடுத்த சந்திப்பை எளிதாகத் தொடருங்கள்',
    },
    description: {
      en: 'Keep planned follow-ups visible to the care team.',
      ta: 'திட்டமிட்ட தொடர் சந்திப்புகளைப் பராமரிப்புக் குழு காணலாம்.',
    },
  },
  {
    id: 'consultation',
    image: consultationPhoto,
    position: '62% 50%',
    alt: {
      en: 'A doctor listening to an older patient during a consultation.',
      ta: 'மருத்துவ ஆலோசனையின் போது வயதான நோயாளியைக் கவனித்துக் கேட்கும் மருத்துவர்.',
    },
    title: {
      en: 'Clear conversations, closer care',
      ta: 'தெளிவான உரையாடல், அருகிலான பராமரிப்பு',
    },
    description: {
      en: 'One shared view of where each referral stands.',
      ta: 'ஒவ்வொரு பரிந்துரையின் நிலையையும் ஒரே இடத்தில் காணலாம்.',
    },
  },
];

export function HeroCarousel({ language }: { language: Language }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (paused || hovered || reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex(index => (index + 1) % slides.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, [hovered, paused, reducedMotion]);

  const showSlide = (index: number) => {
    setActiveIndex((index + slides.length) % slides.length);
  };

  return (
    <section
      className="hero-carousel"
      aria-label={language === 'en' ? 'Community care stories' : 'சமூக பராமரிப்புக் கதைகள்'}
      aria-roledescription="carousel"
      data-testid="carousel-care-stories"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="hero-carousel__viewport">
        <div
          className="hero-carousel__track"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {slides.map((slide, index) => (
            <figure
              key={slide.id}
              className="hero-carousel__slide"
              role="group"
              aria-roledescription={language === 'en' ? 'slide' : 'படம்'}
              aria-label={`${index + 1} / ${slides.length}: ${slide.title[language]}`}
              aria-hidden={index !== activeIndex}
              data-testid={`hero-slide-${slide.id}`}
            >
              <img
                className="hero-carousel__image"
                src={slide.image}
                alt={slide.alt[language]}
                loading={index === 0 ? 'eager' : 'lazy'}
                style={{ objectPosition: slide.position }}
                data-testid={`hero-image-${slide.id}`}
              />
              <figcaption className="hero-carousel__caption">
                <span className="hero-carousel__eyebrow">
                  {language === 'en' ? 'NALAM AI · CARE, CONNECTED' : 'நலம் AI · இணைந்த பராமரிப்பு'}
                </span>
                <h2>{slide.title[language]}</h2>
                <p>{slide.description[language]}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="hero-carousel__controls" aria-label={language === 'en' ? 'Photo controls' : 'படக் கட்டுப்பாடுகள்'}>
          <button
            className="hero-carousel__control"
            type="button"
            onClick={() => showSlide(activeIndex - 1)}
            aria-label={language === 'en' ? 'Previous photo' : 'முந்தைய படம்'}
            data-testid="button-hero-previous"
          >
            <ChevronLeft size={19} aria-hidden="true" />
          </button>
          {!reducedMotion && (
            <button
              className="hero-carousel__control"
              type="button"
              onClick={() => setPaused(value => !value)}
              aria-label={paused
                ? (language === 'en' ? 'Resume automatic photos' : 'படத் தானியக்கத்தைத் தொடங்கு')
                : (language === 'en' ? 'Pause automatic photos' : 'படத் தானியக்கத்தை நிறுத்து')}
              aria-pressed={paused}
              data-testid="button-hero-autoplay"
            >
              {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
            </button>
          )}
          <button
            className="hero-carousel__control"
            type="button"
            onClick={() => showSlide(activeIndex + 1)}
            aria-label={language === 'en' ? 'Next photo' : 'அடுத்த படம்'}
            data-testid="button-hero-next"
          >
            <ChevronRight size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="hero-carousel__pagination" role="group" aria-label={language === 'en' ? 'Choose a photo' : 'ஒரு படத்தைத் தேர்ந்தெடுக்கவும்'}>
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              className={`hero-carousel__dot${index === activeIndex ? ' is-active' : ''}`}
              type="button"
              onClick={() => showSlide(index)}
              aria-label={language === 'en' ? `Show photo ${index + 1}: ${slide.title.en}` : `படம் ${index + 1}: ${slide.title.ta}`}
              aria-pressed={index === activeIndex}
              data-testid={`button-hero-slide-${index + 1}`}
            />
          ))}
          <span className="hero-carousel__count" aria-live="polite" data-testid="text-hero-slide-count">
            {String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </span>
        </div>
      </div>
    </section>
  );
}
