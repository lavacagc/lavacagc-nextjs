'use client'

import { motion } from 'framer-motion'

const reviews = [
  {
    name: 'Spencer C.',
    location: 'Cranford, NJ',
    text: 'The quality of the finished work is outstanding. Their quality of work on my residence gave me the confidence to trust them with our commercial space as well.',
    project: 'Bathroom + Commercial',
  },
  {
    name: 'Ashley S.',
    location: 'New Jersey',
    text: "After putting off a much needed bathroom renovation because I couldn't find a contractor I trusted, I finally found La Vaca. I can't recommend this team enough.",
    project: 'Bathroom Renovation',
  },
  {
    name: 'Ray S.',
    location: 'New Jersey',
    text: 'Veronica stood out for her exceptional attention to detail. The finished basement looks fantastic, and we couldn\'t be happier with the results.',
    project: 'Basement Finishing',
  },
  {
    name: 'Sean M.',
    location: 'New Jersey',
    text: '6 stars if I could. Beyond responsive and reasonable. My new go-to for everything.',
    project: 'Home Renovation',
  },
  {
    name: 'Gerrick K.',
    location: 'Fort Lee, NJ',
    text: 'Alex and his team worked tirelessly through Christmas week to make sure our project was completed. Their dedication and craftsmanship exceeded every expectation.',
    project: 'Full Home Renovation',
  },
  {
    name: 'Kevin H.',
    location: 'New Jersey',
    text: "We couldn't be happier with the work La Vaca did on our home. Professional, responsive, and the results speak for themselves.",
    project: 'Home Renovation',
  },
]

function ReviewCard({ review }: { review: typeof reviews[0] }) {
  return (
    <div className="flex-shrink-0 w-[350px] md:w-[400px] p-6 mx-3 bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl hover:border-primary/30 transition-colors duration-300">
      <div className="flex items-center gap-1 mb-3">
        {[...Array(5)].map((_, i) => (
          <svg key={i} className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ))}
      </div>
      <p className="text-text-secondary text-sm leading-relaxed mb-4">
        &ldquo;{review.text}&rdquo;
      </p>
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-text-primary text-sm">{review.name}</p>
          <p className="text-text-muted text-xs">{review.location} — {review.project}</p>
        </div>
        <div className="flex items-center gap-1 text-xs text-green-500">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          Verified
        </div>
      </div>
    </div>
  )
}

function MarqueeRow({ direction = 'left', speed = 30 }: { direction?: 'left' | 'right'; speed?: number }) {
  const duplicated = [...reviews, ...reviews]
  const isLeft = direction === 'left'

  return (
    <div className="relative overflow-hidden group">
      <motion.div
        className="flex"
        animate={{
          x: isLeft ? ['0%', '-50%'] : ['-50%', '0%'],
        }}
        transition={{
          x: {
            duration: speed,
            repeat: Infinity,
            ease: 'linear',
          },
        }}
        style={{ willChange: 'transform' }}
      >
        {duplicated.map((review, i) => (
          <ReviewCard key={`${review.name}-${i}`} review={review} />
        ))}
      </motion.div>
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />
    </div>
  )
}

export default function TestimonialsMarquee() {
  return (
    <section className="py-20 bg-background overflow-hidden">
      <div className="container mx-auto px-4 mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-text-primary mb-4">
            What Our{' '}
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
              Clients Say
            </span>
          </h2>
          <p className="text-lg text-text-secondary">
            12 clients. 12 five-star reviews. Zero compromises.
          </p>
        </motion.div>
      </div>

      <div className="space-y-6">
        <MarqueeRow direction="left" speed={35} />
        <MarqueeRow direction="right" speed={40} />
      </div>
    </section>
  )
}
