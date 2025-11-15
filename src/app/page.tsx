import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <>
      <Header />
      <main className="min-h-screen">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-background via-background-subtle to-background-soft py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-text-primary mb-6">
                Transform Your Home with{' '}
                <span className="text-primary">La Vaca General Contractors</span>
              </h1>
              <p className="text-xl md:text-2xl text-text-secondary mb-8">
                Premium home remodeling services in Northern New Jersey.
                Kitchen renovations, bathroom upgrades, and complete home transformations.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine bg-[length:400%_100%] animate-gradient"
                >
                  Get Free Estimate
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                >
                  View Our Work
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Services Section */}
        <section id="services" className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                Our Services
              </h2>
              <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                Comprehensive home remodeling services tailored to your vision and budget
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                {
                  title: 'Kitchen Remodeling',
                  description: 'Transform your kitchen into a culinary masterpiece',
                },
                {
                  title: 'Bathroom Renovation',
                  description: 'Create your perfect spa-like retreat',
                },
                {
                  title: 'Basement Finishing',
                  description: 'Unlock your home\'s hidden potential',
                },
                {
                  title: 'Home Additions',
                  description: 'Expand your living space seamlessly',
                },
              ].map((service, index) => (
                <div
                  key={index}
                  className="bg-card border border-border rounded-lg p-6 hover:shadow-card transition-shadow"
                >
                  <h3 className="text-xl font-bold text-text-primary mb-3">
                    {service.title}
                  </h3>
                  <p className="text-text-secondary">
                    {service.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Projects Section */}
        <section id="projects" className="py-20 bg-background-subtle">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4">
                Recent Projects
              </h2>
              <p className="text-lg text-text-secondary max-w-2xl mx-auto">
                See how we've transformed homes across Northern New Jersey
              </p>
            </div>

            <div className="text-center py-12">
              <p className="text-text-muted mb-6">
                Project gallery coming soon...
              </p>
              <Button variant="outline">
                View All Projects
              </Button>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-gradient-to-r from-primary via-accent-sunset to-accent-tangerine">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
              Ready to Start Your Project?
            </h2>
            <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              Get a free consultation and estimate for your home remodeling project today.
            </p>
            <Button
              size="lg"
              className="bg-white text-primary hover:bg-white/90"
            >
              Contact Us Today
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
